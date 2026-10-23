using System.Security.Claims;
using System.Text;
using Api.Data;
using Api.Features.Auth;
using Api.Features.Escrows;
using Api.Features.Jobs;
using FluentValidation;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Ratings;

public static class RatingsEndpoints
{
    private const int DefaultLimit = 20;
    private const int MaxLimit = 50;

    public static IEndpointRouteBuilder MapRatingsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/ratings").RequireAuthorization().WithTags("Ratings");

        group.MapPost("/", CreateAsync);
        group.MapGet("/", ListAsync);

        app.MapGet("/api/users/{id:guid}/rating", GetUserRatingAsync).RequireAuthorization().WithTags("Ratings");

        return app;
    }

    private static async Task<Results<Created<ReviewDto>, ValidationProblem, NotFound<ErrorResponse>, BadRequest<ErrorResponse>, Conflict<ErrorResponse>, ProblemHttpResult>> CreateAsync(
        CreateRatingRequest request,
        IValidator<CreateRatingRequest> validator,
        ClaimsPrincipal principal,
        AppDbContext db,
        ReviewService reviews,
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
            return TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized, detail: "Phiên đăng nhập không hợp lệ.");
        }

        var result = await reviews.CreateAsync(db, request.JobId, userId.Value, request.Rate, request.Comment, ct);

        return result.Status switch
        {
            ReviewCreateStatus.Created => TypedResults.Created($"/api/ratings/{result.Review!.Id}", result.Review!),
            ReviewCreateStatus.JobNotFound => TypedResults.NotFound(new ErrorResponse("Không tìm thấy công việc.")),
            ReviewCreateStatus.JobNotDone => TypedResults.BadRequest(new ErrorResponse("Công việc chưa hoàn thành, chưa thể đánh giá.")),
            ReviewCreateStatus.NotParticipant => TypedResults.Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Bạn không phải người tham gia công việc này."),
            ReviewCreateStatus.SelfReview => TypedResults.BadRequest(new ErrorResponse("Bạn không thể tự đánh giá chính mình.")),
            ReviewCreateStatus.Duplicate => TypedResults.Conflict(new ErrorResponse("Bạn đã đánh giá công việc này rồi.")),
            _ => TypedResults.Problem(statusCode: StatusCodes.Status500InternalServerError, detail: "Không thể tạo đánh giá."),
        };
    }

    // Newest-first by (CreatedAt, Id), same cursor encoding as JobsEndpoints. At least one
    // of `jobId` / `userId` is required; `avg` covers every matching row (not just the page).
    private static async Task<Results<Ok<ReviewListResponse>, ValidationProblem>> ListAsync(
        AppDbContext db,
        CancellationToken ct,
        Guid? jobId = null,
        Guid? userId = null,
        string? cursor = null,
        int? limit = null)
    {
        if (jobId is null && userId is null)
        {
            return ValidationError("filter", "Cần cung cấp jobId hoặc userId.");
        }

        var pageSize = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);

        IQueryable<Review> query = db.Reviews.AsNoTracking()
            .Include(r => r.Job)
            .Include(r => r.Reviewer);

        if (jobId is { } jobFilter)
        {
            query = query.Where(r => r.JobId == jobFilter);
        }

        if (userId is { } userFilter)
        {
            query = ReviewService.ReceivedBy(query, db, userFilter);
        }

        var avg = Math.Round(await query.AverageAsync(r => (double?)r.Rate, ct) ?? 0, 2);

        if (!string.IsNullOrWhiteSpace(cursor))
        {
            if (!TryDecodeCursor(cursor, out var cursorCreatedAt, out var cursorId))
            {
                return ValidationError("cursor", "Cursor không hợp lệ.");
            }

            query = query.Where(r =>
                r.CreatedAt < cursorCreatedAt || (r.CreatedAt == cursorCreatedAt && r.Id.CompareTo(cursorId) < 0));
        }

        var rows = await query
            .OrderByDescending(r => r.CreatedAt)
            .ThenByDescending(r => r.Id)
            .Take(pageSize + 1)
            .ToListAsync(ct);

        var page = rows.Take(pageSize).ToList();

        var jobIds = page.Select(r => r.JobId).Distinct().ToList();
        var payees = await db.Escrows.AsNoTracking()
            .Where(e => jobIds.Contains(e.JobId) && (e.Status == EscrowStatus.Held || e.Status == EscrowStatus.Released))
            .ToDictionaryAsync(e => e.JobId, e => e.PayeeId, ct);

        var reviews = page.Select(r =>
        {
            var revieweeId = r.ReviewerId == r.Job.OwnerId ? payees.GetValueOrDefault(r.JobId) : r.Job.OwnerId;
            return ReviewDto.From(r, r.Job, r.Reviewer, revieweeId);
        }).ToList();

        var nextCursor = rows.Count > pageSize ? EncodeCursor(rows[pageSize - 1].CreatedAt, rows[pageSize - 1].Id) : null;

        return TypedResults.Ok(new ReviewListResponse(reviews, nextCursor, avg));
    }

    private static async Task<Results<Ok<UserRatingResponse>, NotFound<ErrorResponse>>> GetUserRatingAsync(
        Guid id,
        AppDbContext db,
        CancellationToken ct)
    {
        if (!await db.Users.AsNoTracking().AnyAsync(u => u.Id == id, ct))
        {
            return TypedResults.NotFound(new ErrorResponse("Không tìm thấy người dùng."));
        }

        var received = ReviewService.ReceivedBy(db.Reviews.AsNoTracking(), db, id);
        var count = await received.CountAsync(ct);
        var avg = count == 0 ? 0 : Math.Round(await received.AverageAsync(r => (double)r.Rate, ct), 2);

        var jobsDone = await db.Jobs.CountAsync(
            j => j.Status == JobStatus.Done
                && (j.OwnerId == id || db.Escrows.Any(e => e.JobId == j.Id && e.PayeeId == id) || db.JobApplications.Any(a => a.JobId == j.Id && a.WorkerId == id && a.Status == "Done")),
            ct);

        return TypedResults.Ok(new UserRatingResponse(avg, count, jobsDone));
    }

    // Inbound claim mapping may rename `sub`; same reading as Auth/Jobs endpoints.
    private static Guid? GetUserId(ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var id) ? id : null;
    }

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
