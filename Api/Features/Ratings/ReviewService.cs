using Api.Common;
using Api.Data;
using Api.Features.Escrows;
using Api.Features.Jobs;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Api.Features.Ratings;

public enum ReviewCreateStatus
{
    Created,
    JobNotFound,
    JobNotDone,
    NotParticipant,
    SelfReview,
    Duplicate,
}

// `Review` carries the created review in API shape (the reviewee is implicit in the DB).
public sealed record ReviewCreateResult(ReviewCreateStatus Status, ReviewDto? Review = null);

// Task 07: shared review writes. A job's participants are its owner + accepted tasker
// (escrow payee, any Held/Released status); the reviewee is the other participant.
// Every successful insert recomputes the reviewee's cached Users.RatingAvg.
public sealed class ReviewService(ILogger<ReviewService> logger)
{
    private const int CommentMaxLength = 1000;

    // Unique Escrows(JobId) makes the payee single-valued; fallback to JobApplications.
    public static async Task<Guid?> GetPayeeIdAsync(AppDbContext db, Guid jobId, CancellationToken ct)
    {
        var escrowPayee = await db.Escrows.AsNoTracking()
            .Where(e => e.JobId == jobId && (e.Status == EscrowStatus.Held || e.Status == EscrowStatus.Released))
            .Select(e => (Guid?)e.PayeeId)
            .SingleOrDefaultAsync(ct);

        if (escrowPayee is not null)
        {
            return escrowPayee;
        }

        return await db.JobApplications.AsNoTracking()
            .Where(a => a.JobId == jobId && (a.Status == "Accepted" || a.Status == "Done"))
            .Select(a => (Guid?)a.WorkerId)
            .FirstOrDefaultAsync(ct);
    }

    // Reviews received by `userId`: rows on their jobs written by the other participant.
    public static IQueryable<Review> ReceivedBy(IQueryable<Review> source, AppDbContext db, Guid userId) =>
        source.Where(r => r.ReviewerId != userId
            && (db.Jobs.Any(j => j.Id == r.JobId && j.OwnerId == userId)
                || db.Escrows.Any(e => e.JobId == r.JobId && e.PayeeId == userId
                    && (e.Status == EscrowStatus.Held || e.Status == EscrowStatus.Released))
                || db.JobApplications.Any(a => a.JobId == r.JobId && a.WorkerId == userId
                    && (a.Status == "Accepted" || a.Status == "Done"))));

    public async Task<ReviewCreateResult> CreateAsync(
        AppDbContext db,
        Guid jobId,
        Guid reviewerId,
        int rate,
        string? comment,
        CancellationToken ct)
    {
        var job = await db.Jobs.AsNoTracking().SingleOrDefaultAsync(j => j.Id == jobId, ct);
        if (job is null)
        {
            return new ReviewCreateResult(ReviewCreateStatus.JobNotFound);
        }

        var payeeId = await GetPayeeIdAsync(db, jobId, ct);
        var isOwner = job.OwnerId == reviewerId;
        var isPayee = payeeId == reviewerId;

        if (!isOwner && !isPayee)
        {
            return new ReviewCreateResult(ReviewCreateStatus.NotParticipant);
        }

        // Allow review if job is Done, OR if tasker (isPayee) has reported completion
        if (job.Status != JobStatus.Done && !(isPayee && job.IsCompletedReported))
        {
            return new ReviewCreateResult(ReviewCreateStatus.JobNotDone);
        }

        var revieweeId = isOwner ? payeeId : job.OwnerId;
        if (revieweeId is null || revieweeId == reviewerId)
        {
            return new ReviewCreateResult(ReviewCreateStatus.SelfReview);
        }

        if (await db.Reviews.AnyAsync(r => r.JobId == jobId && r.ReviewerId == reviewerId, ct))
        {
            return new ReviewCreateResult(ReviewCreateStatus.Duplicate);
        }

        var reviewer = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == reviewerId, ct);
        var reviewee = await db.Users.SingleOrDefaultAsync(u => u.Id == revieweeId.Value, ct);
        if (reviewer is null || reviewee is null)
        {
            return new ReviewCreateResult(ReviewCreateStatus.NotParticipant);
        }

        // AVG over all reviews received + the new rate (the pending insert is not visible
        // to the query yet), so one SaveChanges writes review + RatingAvg together.
        var rates = await ReceivedBy(db.Reviews.AsNoTracking(), db, revieweeId.Value)
            .Select(r => r.Rate)
            .ToListAsync(ct);
        rates.Add(rate);

        var previousAvg = reviewee.RatingAvg;
        reviewee.RatingAvg = Math.Round(rates.Average(), 2);

        var review = new Review
        {
            Id = GuidV7.NewGuid(),
            JobId = jobId,
            ReviewerId = reviewerId,
            Rate = rate,
            Comment = string.IsNullOrWhiteSpace(comment) ? null : comment.Trim(),
            CreatedAt = DateTime.UtcNow,
        };

        db.Reviews.Add(review);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Race with a duplicate POST: keep the caller's context clean.
            db.Entry(review).State = EntityState.Detached;
            reviewee.RatingAvg = previousAvg;
            return new ReviewCreateResult(ReviewCreateStatus.Duplicate);
        }

        return new ReviewCreateResult(
            ReviewCreateStatus.Created,
            ReviewDto.From(review, job, reviewer, revieweeId.Value));
    }

    // Release-escrow contract: a bad or duplicate rating never fails the release — the
    // escrow has already committed. Returns null when nothing was created.
    public async Task<ReviewCreateResult?> TryCreateAsync(
        AppDbContext db,
        Guid jobId,
        Guid reviewerId,
        int? rate,
        string? comment,
        CancellationToken ct)
    {
        if (rate is null)
        {
            return null;
        }

        if (rate is < 1 or > 5 || comment is { Length: > CommentMaxLength })
        {
            logger.LogWarning(
                "Release-escrow review skipped (job {JobId}, reviewer {ReviewerId}): invalid payload (rate {Rate}).",
                jobId,
                reviewerId,
                rate);
            return null;
        }

        try
        {
            var result = await CreateAsync(db, jobId, reviewerId, rate.Value, comment, ct);
            if (result.Status != ReviewCreateStatus.Created)
            {
                logger.LogWarning(
                    "Release-escrow review skipped (job {JobId}, reviewer {ReviewerId}): {Status}.",
                    jobId,
                    reviewerId,
                    result.Status);
            }

            return result;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Release-escrow review failed (job {JobId}, reviewer {ReviewerId}).", jobId, reviewerId);
            return null;
        }
    }
}
