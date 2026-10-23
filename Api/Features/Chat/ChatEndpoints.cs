using System.Security.Claims;
using System.Text;
using Api.Common;
using Api.Data;
using Api.Features.Auth;
using Api.Features.Escrows;
using Api.Features.Jobs;
using Api.Features.Notifications;
using Api.Hubs;
using FluentValidation;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Api.Features.Chat;

public static class ChatEndpoints
{
    private const int DefaultLimit = 20;
    private const int MaxLimit = 50;

    public static IEndpointRouteBuilder MapChatEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/conversations").RequireAuthorization().WithTags("Chat");

        group.MapPost("/", CreateAsync);
        group.MapGet("/", ListAsync);
        group.MapPost("/{id:guid}/messages", SendMessageAsync);
        group.MapGet("/{id:guid}/messages", ListMessagesAsync);

        return app;
    }

    // Idempotent: one conversation per job (unique index). Existing -> 200, created -> 201.
    // Owner may always create; owner/payee (or anyone on an Open job) may participate (task 06).
    private static async Task<Results<Ok<ConversationDto>, Created<ConversationDto>, ValidationProblem, NotFound<ErrorResponse>, ProblemHttpResult, UnauthorizedHttpResult>> CreateAsync(
        CreateConversationRequest request,
        IValidator<CreateConversationRequest> validator,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return TypedResults.ValidationProblem(validation.ToDictionary());
        }

        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        var job = await db.Jobs.AsNoTracking().SingleOrDefaultAsync(j => j.Id == request.JobId, ct);
        if (job is null)
        {
            return TypedResults.NotFound(new ErrorResponse("Không tìm thấy công việc."));
        }

        if (!await ChatAccess.CanParticipateAsync(db, job.Id, job.OwnerId, job.Status, userId.Value, ct))
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Bạn không phải là người tham gia công việc này.");
        }

        var existing = await db.Conversations.AsNoTracking().SingleOrDefaultAsync(c => c.JobId == job.Id, ct);
        if (existing is not null)
        {
            return TypedResults.Ok(ToDto(existing));
        }

        var conversation = new Conversation
        {
            Id = GuidV7.NewGuid(),
            JobId = job.Id,
            CreatedAt = DateTime.UtcNow,
        };

        db.Conversations.Add(conversation);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Race: another request created it first — stay idempotent.
            db.Entry(conversation).State = EntityState.Detached;
            var raced = await db.Conversations.AsNoTracking().SingleOrDefaultAsync(c => c.JobId == job.Id, ct);
            if (raced is null)
            {
                throw;
            }

            return TypedResults.Ok(ToDto(raced));
        }

        return TypedResults.Created($"/api/conversations/{conversation.Id}", ToDto(conversation));
    }

    // Task 06 participant rule: owner or escrow payee (Held/Released). While the job is
    // still Open the pre-assignment browsing rule stays: a non-owner sees the conversation
    // once they have sent a message, or while it is untouched by any non-owner.
    private static async Task<Results<Ok<List<ConversationListItemDto>>, UnauthorizedHttpResult>> ListAsync(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        var conversations = await db.Conversations.AsNoTracking()
            .Include(c => c.Job)
            .ThenInclude(j => j.Owner)
            .Where(c => c.Job.OwnerId == userId
                || db.Escrows.Any(e => e.JobId == c.JobId && e.PayeeId == userId
                    && (e.Status == EscrowStatus.Held || e.Status == EscrowStatus.Released))
                || db.JobApplications.Any(a => a.JobId == c.JobId && a.WorkerId == userId)
                || (c.Job.Status == JobStatus.Open
                    && (c.Messages.Any(m => m.SenderId == userId)
                        || !c.Messages.Any(m => m.SenderId != c.Job.OwnerId))))
            .ToListAsync(ct);

        var rows = new List<(Conversation Conversation, ConversationLastMessageDto? LastMessage, ConversationPeerDto? Peer)>(conversations.Count);

        foreach (var conversation in conversations)
        {
            var lastMessage = await db.Messages.AsNoTracking()
                .Where(m => m.ConversationId == conversation.Id)
                .OrderByDescending(m => m.CreatedAt)
                .ThenByDescending(m => m.Id)
                .Select(m => new ConversationLastMessageDto(m.Id, m.Body, m.SenderId, m.CreatedAt))
                .FirstOrDefaultAsync(ct);

            ConversationPeerDto? peer;
            if (conversation.Job.OwnerId != userId)
            {
                peer = new ConversationPeerDto(conversation.Job.Owner.Id, conversation.Job.Owner.Name, conversation.Job.Owner.AvatarUrl);
            }
            else
            {
                // Owner's counterpart: the latest tasker who wrote into this job conversation.
                peer = await db.Messages.AsNoTracking()
                    .Where(m => m.ConversationId == conversation.Id && m.SenderId != conversation.Job.OwnerId)
                    .OrderByDescending(m => m.CreatedAt)
                    .ThenByDescending(m => m.Id)
                    .Select(m => new ConversationPeerDto(m.Sender.Id, m.Sender.Name, m.Sender.AvatarUrl))
                    .FirstOrDefaultAsync(ct);

                if (peer is null)
                {
                    var worker = await db.JobApplications.AsNoTracking()
                        .Where(a => a.JobId == conversation.JobId)
                        .OrderByDescending(a => a.Status == "Done" || a.Status == "Accepted" ? 1 : 0)
                        .ThenByDescending(a => a.CreatedAt)
                        .Select(a => a.Worker)
                        .FirstOrDefaultAsync(ct);

                    if (worker is not null)
                    {
                        peer = new ConversationPeerDto(worker.Id, worker.Name, worker.AvatarUrl);
                    }
                }
            }

            rows.Add((conversation, lastMessage, peer));
        }

        // lastMessage.createdAt desc (conversations without messages last), then createdAt desc.
        var items = rows
            .OrderByDescending(r => r.LastMessage is not null)
            .ThenByDescending(r => r.LastMessage == null ? DateTime.MinValue : r.LastMessage.CreatedAt)
            .ThenByDescending(r => r.Conversation.CreatedAt)
            .Select(r => new ConversationListItemDto(
                r.Conversation.Id,
                r.Conversation.JobId,
                new ConversationJobDto(
                    r.Conversation.Job.Id,
                    r.Conversation.Job.Title,
                    r.Conversation.Job.Status.ToString(),
                    r.Conversation.Job.Category,
                    r.Conversation.Job.Price),
                r.Peer,
                r.LastMessage,
                UnreadCount: 0)) // read tracking arrives with notifications (task 05)
            .ToList();

        return TypedResults.Ok(items);
    }

    // Participant by the send rule: owner or escrow payee; anyone while the job is Open. 404 unknown id.
    private static async Task<Results<Created<MessageDto>, ValidationProblem, NotFound<ErrorResponse>, ProblemHttpResult, UnauthorizedHttpResult>> SendMessageAsync(
        Guid id,
        SendMessageRequest request,
        IValidator<SendMessageRequest> validator,
        ClaimsPrincipal principal,
        AppDbContext db,
        IHubContext<ChatHub> hub,
        NotificationService notifications,
        CancellationToken ct)
    {
        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return TypedResults.ValidationProblem(validation.ToDictionary());
        }

        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        var conversation = await db.Conversations
            .Include(c => c.Job)
            .SingleOrDefaultAsync(c => c.Id == id, ct);
        if (conversation is null)
        {
            return TypedResults.NotFound(new ErrorResponse("Không tìm thấy cuộc trò chuyện."));
        }

        if (!await ChatAccess.CanParticipateAsync(db, conversation.Job.Id, conversation.Job.OwnerId, conversation.Job.Status, userId.Value, ct))
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Bạn không phải là người tham gia cuộc trò chuyện này.");
        }

        var message = new Message
        {
            ConversationId = conversation.Id,
            SenderId = userId.Value,
            Body = request.Body.Trim(),
            CreatedAt = DateTime.UtcNow,
        };

        db.Messages.Add(message);
        await db.SaveChangesAsync(ct);

        var dto = ToDto(message);

        // Post-commit fan-out (GLM P8) so REST sends also reach hub listeners.
        await hub.Clients.Group(conversation.JobId.ToString()).SendAsync("ReceiveMessage", dto);

        // Task 05: notify the other participants (best-effort, never fails the send).
        await notifications.NotifyChatMessageAsync(
            db, conversation.JobId, conversation.Job.OwnerId, userId.Value, message.Body, ct);

        return TypedResults.Created($"/api/conversations/{conversation.Id}/messages/{message.Id}", dto);
    }

    private static async Task<Results<Ok<MessageListResponse>, ValidationProblem, NotFound<ErrorResponse>, ProblemHttpResult, UnauthorizedHttpResult>> ListMessagesAsync(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct,
        string? cursor = null,
        int? limit = null)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        var conversation = await db.Conversations.AsNoTracking()
            .Include(c => c.Job)
            .SingleOrDefaultAsync(c => c.Id == id, ct);
        if (conversation is null)
        {
            return TypedResults.NotFound(new ErrorResponse("Không tìm thấy cuộc trò chuyện."));
        }

        if (!await ChatAccess.CanParticipateAsync(db, conversation.Job.Id, conversation.Job.OwnerId, conversation.Job.Status, userId.Value, ct))
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Bạn không phải là người tham gia cuộc trò chuyện này.");
        }

        var pageSize = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);

        var query = db.Messages.AsNoTracking().Where(m => m.ConversationId == id);

        if (!string.IsNullOrWhiteSpace(cursor))
        {
            if (!TryDecodeCursor(cursor, out var cursorCreatedAt, out var cursorId))
            {
                return ValidationError("cursor", "Cursor không hợp lệ.");
            }

            query = query.Where(m =>
                m.CreatedAt < cursorCreatedAt || (m.CreatedAt == cursorCreatedAt && m.Id.CompareTo(cursorId) < 0));
        }

        var rows = await query
            .OrderByDescending(m => m.CreatedAt)
            .ThenByDescending(m => m.Id)
            .Take(pageSize + 1)
            .Select(m => new MessageDto(m.Id, m.ConversationId, m.SenderId, m.Body, m.CreatedAt))
            .ToListAsync(ct);

        var messages = rows.Take(pageSize).ToList();
        var nextCursor = rows.Count > pageSize
            ? EncodeCursor(rows[pageSize - 1].CreatedAt, rows[pageSize - 1].Id)
            : null;

        return TypedResults.Ok(new MessageListResponse(messages, nextCursor));
    }

    private static Guid? GetUserId(ClaimsPrincipal principal)
    {
        // Inbound claim mapping may rename `sub`; same reading as Auth/Jobs endpoints.
        var raw = principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var id) ? id : null;
    }

    private static ConversationDto ToDto(Conversation conversation) =>
        new(conversation.Id, conversation.JobId, conversation.CreatedAt);

    private static MessageDto ToDto(Message message) =>
        new(message.Id, message.ConversationId, message.SenderId, message.Body, message.CreatedAt);

    private static ValidationProblem ValidationError(string field, string message) =>
        TypedResults.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    // Same cursor encoding as JobsEndpoints: `createdAt.Ticks|id:N` base64url.
    private static string EncodeCursor(DateTime createdAt, Guid id) =>
        Base64UrlEncode(Encoding.UTF8.GetBytes($"{createdAt.Ticks}|{id:N}"));

    private static bool TryDecodeCursor(string raw, out DateTime createdAt, out Guid id)
    {
        createdAt = default;
        id = default;

        try
        {
            var base64 = raw.Replace('-', '+').Replace('_', '/');
            base64 = base64.PadRight(base64.Length + (4 - base64.Length % 4) % 4, '=');
            var parts = Encoding.UTF8.GetString(Convert.FromBase64String(base64)).Split('|');

            if (parts.Length != 2 || !long.TryParse(parts[0], out var ticks) || !Guid.TryParseExact(parts[1], "N", out id))
            {
                return false;
            }

            createdAt = new DateTime(ticks, DateTimeKind.Utc);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
