using System.Security.Claims;
using System.Text;
using Api.Common;
using Api.Data;
using Api.Features.Auth;
using Api.Features.Escrows;
using Api.Features.Notifications;
using Api.Features.Ratings;
using Api.Features.Wallet;
using FluentValidation;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Api.Features.Jobs;

public static class JobsEndpoints
{
    private const int DefaultLimit = 20;
    private const int MaxLimit = 50;
    private const int GeoFetchCap = 200; // bbox window fetched before the in-memory Haversine sort
    private const double EarthRadiusKm = 6371.0088;

    public static IEndpointRouteBuilder MapJobsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/jobs").RequireAuthorization().WithTags("Jobs");

        group.MapGet("/", ListAsync);
        group.MapPost("/", CreateAsync);
        group.MapGet("/{id:guid}", GetByIdAsync);
        group.MapPatch("/{id:guid}", UpdateAsync);
        group.MapDelete("/{id:guid}", DeleteAsync);

        // Task 06: escrow lifecycle.
        group.MapPost("/{id:guid}/accept", AcceptAsync);
        group.MapPost("/{id:guid}/report", ReportAsync);
        group.MapPost("/{id:guid}/release-escrow", ReleaseEscrowAsync);
        group.MapPost("/{id:guid}/cancel", CancelAsync);
        group.MapPost("/{id:guid}/refund", RefundAsync);

        return app;
    }

    private static async Task<Results<Ok<JobListResponse>, ValidationProblem, UnauthorizedHttpResult>> ListAsync(
        AppDbContext db,
        ClaimsPrincipal principal,
        CancellationToken ct,
        string? status = null,
        string? category = null,
        string? q = null,
        double? lat = null,
        double? lng = null,
        double? radius = null,
        string? cursor = null,
        int? limit = null,
        bool? mine = null)
    {
        JobStatus? statusFilter = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!Enum.TryParse<JobStatus>(status, ignoreCase: true, out var parsed))
            {
                return ValidationError("status", "Trạng thái không hợp lệ (Open/Assigned/Done/Cancelled).");
            }

            statusFilter = parsed;
        }

        if (lat.HasValue != lng.HasValue)
        {
            return ValidationError("lat", "Cần cung cấp cả lat và lng.");
        }

        var hasGeo = lat.HasValue && lng.HasValue;
        if (hasGeo && radius.HasValue && (radius.Value <= 0 || radius.Value > 50))
        {
            return ValidationError("radius", "Bán kính phải trong khoảng 0-50km.");
        }

        var pageSize = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);

        IQueryable<Job> query = db.Jobs.AsNoTracking().Include(j => j.Owner).Include(j => j.Images);

        // Task 12a: admin-hidden jobs never appear in the list/geo board (owner included).
        query = query.Where(j => !j.Hidden);

        if (mine == true)
        {
            var userId = GetUserId(principal);
            if (userId is null)
            {
                return TypedResults.Unauthorized();
            }

            var me = userId.Value;

            // Task 06: owner's own jobs + jobs where the caller is the accepted tasker
            query = query.Where(j => j.OwnerId == me
                || db.JobApplications.Any(a => a.JobId == j.Id && a.WorkerId == me && (a.Status == "Accepted" || a.Status == "Done")));
        }

        if (statusFilter is { } statusValue)
        {
            query = query.Where(j => j.Status == statusValue);
        }

        if (!string.IsNullOrWhiteSpace(category))
        {
            query = query.Where(j => j.Category == category);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = $"%{q.Trim()}%";
            query = query.Where(j => EF.Functions.ILike(j.Title, pattern) || EF.Functions.ILike(j.Description, pattern));
        }

        if (!string.IsNullOrWhiteSpace(cursor))
        {
            if (!TryDecodeCursor(cursor, out var cursorIsUrgent, out var cursorCreatedAt, out var cursorId))
            {
                return ValidationError("cursor", "Cursor không hợp lệ.");
            }

            query = query.Where(j =>
                (cursorIsUrgent && !j.IsUrgent) || 
                (j.IsUrgent == cursorIsUrgent && (j.CreatedAt < cursorCreatedAt || (j.CreatedAt == cursorCreatedAt && j.Id.CompareTo(cursorId) < 0))));
        }

        if (!hasGeo)
        {
            var rows = await query
                .OrderByDescending(j => j.IsUrgent)
                .ThenByDescending(j => j.CreatedAt)
                .ThenByDescending(j => j.Id)
                .Take(pageSize + 1)
                .ToListAsync(ct);

            var page = rows.Take(pageSize).Select(j => ToDto(j)).ToList();
            var nextCursor = rows.Count > pageSize ? EncodeCursor(rows[pageSize - 1]) : null;
            return TypedResults.Ok(new JobListResponse(page, nextCursor));
        }

        // Geo: bbox prefilter in SQL (Haversine does not translate), then exact
        // distance filter + Haversine sort in memory. Cursor pagination is applied
        // before the distance sort, so geo pages do not hand out a next cursor.
        var radiusKm = radius ?? 5;
        var centerLat = lat!.Value;
        var centerLng = lng!.Value;
        var latDelta = radiusKm / 111.32;
        var lngDelta = radiusKm / (111.32 * Math.Max(Math.Cos(ToRadians(centerLat)), 0.01));

        query = query.Where(j =>
            (j.Lat == null || j.Lng == null) ||
            (j.Lat >= centerLat - latDelta && j.Lat <= centerLat + latDelta
            && j.Lng >= centerLng - lngDelta && j.Lng <= centerLng + lngDelta));

        var candidates = await query
            .OrderByDescending(j => j.IsUrgent)
            .ThenByDescending(j => j.CreatedAt)
            .ThenByDescending(j => j.Id)
            .Take(GeoFetchCap)
            .ToListAsync(ct);

        var jobs = candidates
            .Select(j => (Job: j, DistanceKm: (j.Lat != null && j.Lng != null) ? (double?)HaversineKm(centerLat, centerLng, j.Lat.Value, j.Lng.Value) : null))
            .Where(x => x.DistanceKm == null || x.DistanceKm.Value <= radiusKm)
            .OrderByDescending(x => x.Job.IsUrgent)
            .ThenBy(x => x.DistanceKm.HasValue ? 0 : 1)
            .ThenBy(x => x.DistanceKm ?? double.MaxValue)
            .ThenByDescending(x => x.Job.CreatedAt)
            .ThenByDescending(x => x.Job.Id)
            .Take(pageSize)
            .Select(x => ToDto(x.Job, x.DistanceKm.HasValue ? Math.Round(x.DistanceKm.Value, 2) : null))
            .ToList();

        return TypedResults.Ok(new JobListResponse(jobs, NextCursor: null));
    }

    private static async Task<Results<Created<JobDto>, ValidationProblem, ProblemHttpResult, UnauthorizedHttpResult>> CreateAsync(
        CreateJobRequest request,
        IValidator<CreateJobRequest> validator,
        ClaimsPrincipal principal,
        AppDbContext db,
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

        var owner = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (owner is null)
        {
            return TypedResults.Unauthorized();
        }

        var wallet = await db.Wallets.SingleOrDefaultAsync(w => w.UserId == userId, ct);
        if (wallet is null)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Không tìm thấy ví.");
        }

        var cost = request.IsUrgent ? 15m : 10m;
        if (wallet.Balance < cost)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Số dư không đủ. Vui lòng nạp thêm Token.");
        }

        wallet.Balance -= cost;

        db.WalletTransactions.Add(new Api.Features.Wallet.WalletTransaction
        {
            Id = GuidV7.NewGuid(),
            UserId = userId.Value,
            Type = Api.Features.Wallet.WalletTransactionType.Hold,
            Amount = -cost,
            CreatedAt = DateTime.UtcNow,
        });

        var job = new Job
        {
            Id = GuidV7.NewGuid(),
            OwnerId = owner.Id,
            Owner = owner,
            Title = request.Title.Trim(),
            Description = request.Description.Trim(),
            Category = request.Category,
            Price = request.Price,
            Status = JobStatus.Open,
            Lat = request.Lat,
            Lng = request.Lng,
            IsUrgent = request.IsUrgent,
            LocationText = request.LocationText?.Trim(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Images = request.Images?.Select(url => new JobImage { Url = url }).ToList() ?? [],
        };

        db.Jobs.Add(job);
        await db.SaveChangesAsync(ct);

        // Task 05: announce the new job to seekers (owner excluded), capped. Post-commit
        // + best-effort.
        await notifications.NotifyNewJobAsync(db, job, ct);

        return TypedResults.Created($"/api/jobs/{job.Id}", ToDto(job));
    }

    private static async Task<Results<Ok<JobDto>, NotFound<ErrorResponse>>> GetByIdAsync(
        Guid id,
        AppDbContext db,
        CancellationToken ct)
    {
        var job = await db.Jobs.AsNoTracking()
            .Include(j => j.Owner)
            .Include(j => j.Images)
            .SingleOrDefaultAsync(j => j.Id == id, ct);

        return job is null
            ? TypedResults.NotFound(new ErrorResponse("Không tìm thấy công việc."))
            : TypedResults.Ok(ToDto(job));
    }

    private static async Task<Results<Ok<JobDto>, ValidationProblem, NotFound<ErrorResponse>, ProblemHttpResult, UnauthorizedHttpResult>> UpdateAsync(
        Guid id,
        UpdateJobRequest request,
        IValidator<UpdateJobRequest> validator,
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

        var job = await db.Jobs
            .Include(j => j.Owner)
            .Include(j => j.Images)
            .SingleOrDefaultAsync(j => j.Id == id, ct);
        if (job is null)
        {
            return TypedResults.NotFound(new ErrorResponse("Không tìm thấy công việc."));
        }

        if (job.OwnerId != userId)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Bạn không phải chủ công việc.");
        }

        if (request.Title is not null)
        {
            job.Title = request.Title.Trim();
        }

        if (request.Description is not null)
        {
            job.Description = request.Description.Trim();
        }

        if (request.Category is not null)
        {
            job.Category = request.Category;
        }

        if (request.Price.HasValue)
        {
            job.Price = request.Price.Value;
        }

        if (request.LocationText is not null)
        {
            job.LocationText = request.LocationText.Trim();
        }

        if (request.Lat.HasValue)
        {
            job.Lat = request.Lat;
        }

        if (request.Lng.HasValue)
        {
            job.Lng = request.Lng;
        }

        job.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(ToDto(job));
    }

    private static async Task<Results<NoContent, NotFound<ErrorResponse>, Conflict<ErrorResponse>, ProblemHttpResult, UnauthorizedHttpResult>> DeleteAsync(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        var job = await db.Jobs.SingleOrDefaultAsync(j => j.Id == id, ct);
        if (job is null)
        {
            return TypedResults.NotFound(new ErrorResponse("Không tìm thấy công việc."));
        }

        if (job.OwnerId != userId)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Bạn không phải chủ công việc.");
        }

        if (job.Status == JobStatus.Assigned || job.Status == JobStatus.Done)
        {
            return TypedResults.Conflict(new ErrorResponse("Công việc đã được nhận, không thể xóa."));
        }

        db.Jobs.Remove(job);
        await db.SaveChangesAsync(ct);

        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<JobDto>, BadRequest<ErrorResponse>, NotFound<ErrorResponse>, Conflict<ErrorResponse>, ProblemHttpResult, UnauthorizedHttpResult>> AcceptAsync(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        NotificationService notifications,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        try
        {
            var job = await db.Jobs
                .Include(j => j.Owner)
                .Include(j => j.Images)
                .SingleOrDefaultAsync(j => j.Id == id, ct);
            if (job is null)
            {
                return TypedResults.NotFound(new ErrorResponse("Không tìm thấy công việc."));
            }

            if (job.OwnerId == userId)
            {
                return TypedResults.Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Bạn không thể nhận việc của chính mình.");
            }

            if (job.Status != JobStatus.Open)
            {
                return TypedResults.Conflict(new ErrorResponse("Công việc đã có người nhận hoặc không còn mở."));
            }

            var taskerWallet = await db.Wallets.SingleOrDefaultAsync(w => w.UserId == userId.Value, ct);
            if (taskerWallet is null)
            {
                taskerWallet = new Api.Features.Wallet.Wallet { UserId = userId.Value, Balance = 0 };
                db.Wallets.Add(taskerWallet);
            }


            var fee = Math.Max(1m, job.Price / 1000m); // e.g. 200,000 => 200 tokens
            
            // Wait, the user said 10%. "công việc giá 200.000 thì tasker phải trả 20.000 nghĩa là trừ 20 token".
            // So fee = 20 tokens. Meaning Job.Price * 0.1 / 1000. Wait! 200,000 * 10% = 20,000. 20,000 is 20 tokens (1000 = 1 token). So fee = Job.Price * 0.1 / 1000 = Job.Price / 10000.
            // Let me re-read: "mỗi công việc tasker trả 10% giá trị tiền nhận được ví dụ: công việc giá 200.000 thì tasker phải trả 20.000 nghĩa là trừ 20 token".
            // 200,000 * 10% = 20,000.
            // 20 token = 20,000. So 1 token = 1,000 VND.
            // Yes! `job.Price / 10000m` is correct for 10% converted to tokens! 
            // Wait, 200,000 / 10,000 = 20. Yes.
            var tokenFee = Math.Ceiling(job.Price / 10000m);

            if (taskerWallet.Balance < tokenFee)
            {
                return TypedResults.BadRequest(new ErrorResponse($"Số dư không đủ để nhận việc. Cần {tokenFee} Token."));
            }

            var now = DateTime.UtcNow;

            taskerWallet.Balance -= tokenFee;
            db.WalletTransactions.Add(new WalletTransaction
            {
                Id = GuidV7.NewGuid(),
                UserId = userId.Value,
                Type = WalletTransactionType.Hold, // Or a new type "Fee". For now we can use Hold or generic.
                Amount = -tokenFee,
                RefJobId = job.Id,
                CreatedAt = now,
            });

            var application = await db.JobApplications
                .SingleOrDefaultAsync(a => a.JobId == job.Id && a.WorkerId == userId.Value, ct);
            if (application is null)
            {
                db.JobApplications.Add(new JobApplication
                {
                    JobId = job.Id,
                    WorkerId = userId.Value,
                    Status = "Accepted",
                    CreatedAt = now,
                });
            }
            else
            {
                application.Status = "Accepted";
                application.CreatedAt = now;
            }

            job.Status = JobStatus.Assigned;
            job.UpdatedAt = now;

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);

            // Task 05: tell the owner who accepted (post-commit, best-effort).
            var taskerName = await db.Users.AsNoTracking()
                .Where(u => u.Id == userId.Value)
                .Select(u => u.Name)
                .SingleOrDefaultAsync(ct) ?? "Người nhận việc";

            await notifications.CreateAndSendAsync(
                db,
                job.OwnerId,
                NotificationTypes.JobMatched,
                "Có người nhận việc",
                $"{taskerName} đã nhận \"{job.Title}\"",
                job.Id,
                ct);

            return TypedResults.Ok(ToDto(job));
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict("Công việc vừa được người khác nhận. Vui lòng thử lại.");
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Unique Escrows(JobId): the other concurrent accept won.
            return Conflict("Công việc vừa được người khác nhận.");
        }
        catch (Exception ex)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status500InternalServerError, detail: $"Lỗi xử lý nhận việc: {ex.Message}");
        }
    }

    // Task 06: the payee marks work as done; the owner then releases or cancels.
    private static async Task<Results<NoContent, NotFound<ErrorResponse>, Conflict<ErrorResponse>, ProblemHttpResult, UnauthorizedHttpResult>> ReportAsync(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        NotificationService notifications,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        var job = await db.Jobs.SingleOrDefaultAsync(j => j.Id == id, ct);
        if (job is null)
        {
            return TypedResults.NotFound(new ErrorResponse("Không tìm thấy công việc."));
        }

        var isPayee = await db.JobApplications.AsNoTracking().AnyAsync(
            a => a.JobId == id && a.WorkerId == userId && a.Status == "Accepted", ct);
        if (!isPayee || job.Status != JobStatus.Assigned)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Bạn không phải người nhận việc của công việc này.");
        }

        if (job.IsCompletedReported)
        {
            return TypedResults.NoContent(); // idempotent
        }

        job.IsCompletedReported = true;
        job.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict("Công việc vừa được cập nhật, vui lòng thử lại.");
        }

        // Task 05: tell the owner the tasker reported completion (post-commit, best-effort).
        var taskerName = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId.Value)
            .Select(u => u.Name)
            .SingleOrDefaultAsync(ct) ?? "Người nhận việc";

        await notifications.CreateAndSendAsync(
            db,
            job.OwnerId,
            NotificationTypes.JobMatched,
            "Tasker báo hoàn thành",
            $"{taskerName} đã báo hoàn thành \"{job.Title}\"",
            job.Id,
            ct);

        return TypedResults.NoContent();
    }

    // Task 06: payer confirms completion -> escrow Released + payee credited + job Done.
    // Task 07: an optional `{rating?, comment?}` body creates a review (payer rates payee).
    // Task 12a: the ledger transition lives in EscrowLedgerService (shared with admin).
    private static async Task<Results<Ok<JobDto>, NotFound<ErrorResponse>, Conflict<ErrorResponse>, ProblemHttpResult, UnauthorizedHttpResult>> ReleaseEscrowAsync(
        Guid id,
        ReleaseEscrowRequest? request,
        ClaimsPrincipal principal,
        AppDbContext db,
        NotificationService notifications,
        ReviewService reviews,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        var job = await db.Jobs
            .Include(j => j.Owner)
            .Include(j => j.Images)
            .SingleOrDefaultAsync(j => j.Id == id, ct);
        if (job is null)
        {
            return TypedResults.NotFound(new ErrorResponse("Không tìm thấy công việc."));
        }

        if (job.OwnerId != userId.Value)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Bạn không phải chủ công việc này.");
        }

        if (job.Status != JobStatus.Assigned)
        {
            return TypedResults.Conflict(new ErrorResponse("Công việc không ở trạng thái đang thực hiện."));
        }

        job.Status = JobStatus.Done;
        job.UpdatedAt = DateTime.UtcNow;

        var application = await db.JobApplications.FirstOrDefaultAsync(a => a.JobId == id && a.Status == "Accepted", ct);
        if (application != null)
        {
            application.Status = "Done";
        }

        await db.SaveChangesAsync(ct);

        if (application != null)
        {
            await notifications.CreateAndSendAsync(
                db,
                application.WorkerId,
                NotificationTypes.EscrowReleased,
                "Công việc hoàn thành",
                $"\"{job.Title}\" đã được xác nhận hoàn thành",
                job.Id,
                ct);
        }

        await reviews.TryCreateAsync(db, job.Id, userId.Value, request?.Rating, request?.Comment, ct);

        return TypedResults.Ok(ToDto(job));
    }

    // Task 06: owner cancels. Open -> Cancelled (no ledger); Assigned & not reported ->
    // refund the Held escrow to the payer and set Cancelled.
    private static async Task<Results<Ok<JobDto>, NoContent, NotFound<ErrorResponse>, Conflict<ErrorResponse>, ProblemHttpResult, UnauthorizedHttpResult>> CancelAsync(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        NotificationService notifications,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        var job = await db.Jobs
            .Include(j => j.Owner)
            .Include(j => j.Images)
            .SingleOrDefaultAsync(j => j.Id == id, ct);
        if (job is null)
        {
            return TypedResults.NotFound(new ErrorResponse("Không tìm thấy công việc."));
        }

        if (job.OwnerId != userId.Value)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Bạn không phải chủ công việc.");
        }

        if (job.Status == JobStatus.Cancelled)
        {
            return TypedResults.NoContent();
        }

        if (job.Status == JobStatus.Done)
        {
            return TypedResults.Conflict(new ErrorResponse("Công việc đã hoàn thành, không thể hủy."));
        }

        if (job.Status == JobStatus.Assigned && job.IsCompletedReported)
        {
            return TypedResults.Conflict(new ErrorResponse("Người nhận việc đã báo hoàn thành, hãy giải ngân (xác nhận) thay vì hủy."));
        }

        job.Status = JobStatus.Cancelled;
        job.UpdatedAt = DateTime.UtcNow;

        var app = await db.JobApplications.FirstOrDefaultAsync(a => a.JobId == id && a.Status == "Accepted", ct);
        if (app != null)
        {
            app.Status = "Cancelled";
            await notifications.CreateAndSendAsync(
                db,
                app.WorkerId,
                NotificationTypes.EscrowReleased,
                "Việc đã huỷ",
                $"\"{job.Title}\" đã bị chủ việc huỷ.",
                job.Id,
                ct);
        }

        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(ToDto(job));
    }

    // Task 06: payee abandons a Held escrow. Same refund path as cancel but the job
    // goes back to the board (Open) instead of Cancelled.
    // Task 12a: the ledger transition lives in EscrowLedgerService (shared with admin).
    private static async Task<Results<Ok<JobDto>, NotFound<ErrorResponse>, Conflict<ErrorResponse>, ProblemHttpResult, UnauthorizedHttpResult>> RefundAsync(
        Guid id,
        ClaimsPrincipal principal,
        AppDbContext db,
        NotificationService notifications,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        var job = await db.Jobs
            .Include(j => j.Owner)
            .Include(j => j.Images)
            .SingleOrDefaultAsync(j => j.Id == id, ct);
        if (job is null)
        {
            return TypedResults.NotFound(new ErrorResponse("Không tìm thấy công việc."));
        }

        var application = await db.JobApplications.FirstOrDefaultAsync(a => a.JobId == id && a.WorkerId == userId && a.Status == "Accepted", ct);
        if (application == null)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Bạn không phải người nhận việc của công việc này.");
        }

        job.Status = JobStatus.Open;
        job.UpdatedAt = DateTime.UtcNow;
        application.Status = "Abandoned";

        await db.SaveChangesAsync(ct);

        var taskerName = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId.Value)
            .Select(u => u.Name)
            .SingleOrDefaultAsync(ct) ?? "Người nhận việc";

        await notifications.CreateAndSendAsync(
            db,
            job.OwnerId,
            NotificationTypes.EscrowReleased,
            "Việc đã bị huỷ",
            $"{taskerName} đã huỷ nhận \"{job.Title}\". Công việc đã được mở lại.",
            job.Id,
            ct);

        return TypedResults.Ok(ToDto(job));
    }

    private static Conflict<ErrorResponse> Conflict(string message) => TypedResults.Conflict(new ErrorResponse(message));

    private static JobDto ToDto(Job job, double? distanceKm = null) => new(
        job.Id,
        job.Owner != null
            ? new JobOwnerDto(job.Owner.Id, job.Owner.Name, job.Owner.AvatarUrl, job.Owner.RatingAvg)
            : new JobOwnerDto(job.OwnerId, string.Empty, null, 0),
        job.Title,
        job.Description,
        job.Category,
        job.Price,
        job.Status.ToString(),
        job.IsCompletedReported,
        job.Lat,
        job.Lng,
        distanceKm,
        job.LocationText,
        job.Images != null ? job.Images.Select(image => image.Url).ToList() : [],
        job.IsUrgent,
        job.CreatedAt,
        job.UpdatedAt);

    // Inbound claim mapping may rename `sub`; same reading as AuthEndpoints.
    private static Guid? GetUserId(ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var id) ? id : null;
    }

    private static ValidationProblem ValidationError(string field, string message) =>
        TypedResults.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    private static string EncodeCursor(Job job) =>
        Base64UrlEncode(Encoding.UTF8.GetBytes($"{(job.IsUrgent ? 1 : 0)}|{job.CreatedAt.Ticks}|{job.Id:N}"));

    private static bool TryDecodeCursor(string raw, out bool isUrgent, out DateTime createdAt, out Guid id)
    {
        isUrgent = false;
        createdAt = default;
        id = default;

        try
        {
            var base64 = raw.Replace('-', '+').Replace('_', '/');
            base64 = base64.PadRight(base64.Length + (4 - base64.Length % 4) % 4, '=');
            var parts = Encoding.UTF8.GetString(Convert.FromBase64String(base64)).Split('|');

            if (parts.Length != 3 || !int.TryParse(parts[0], out var u) || !long.TryParse(parts[1], out var ticks) || !Guid.TryParseExact(parts[2], "N", out id))
            {
                // Fallback for old cursors
                if (parts.Length == 2 && long.TryParse(parts[0], out ticks) && Guid.TryParseExact(parts[1], "N", out id))
                {
                    createdAt = new DateTime(ticks, DateTimeKind.Utc);
                    isUrgent = false; // Assuming old jobs are not urgent for fallback
                    return true;
                }
                return false;
            }

            isUrgent = u == 1;
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

    private static double ToRadians(double degrees) => degrees * Math.PI / 180;

    private static double HaversineKm(double lat1, double lng1, double lat2, double lng2)
    {
        var dLat = ToRadians(lat2 - lat1);
        var dLng = ToRadians(lng2 - lng1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
            + Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2)) * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return EarthRadiusKm * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }
}
