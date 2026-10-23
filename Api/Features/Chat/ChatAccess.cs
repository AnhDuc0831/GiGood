using Api.Data;
using Api.Features.Escrows;
using Api.Features.Jobs;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Chat;

// Task 06 participant rule: the job owner, the accepted escrow payee (Held/Released),
// or the worker who applied for/accepted the job, or anyone while the job is still Open.
internal static class ChatAccess
{
    public static async Task<bool> CanParticipateAsync(
        AppDbContext db,
        Guid jobId,
        Guid ownerId,
        JobStatus status,
        Guid userId,
        CancellationToken ct = default)
    {
        if (ownerId == userId || status == JobStatus.Open)
        {
            return true;
        }

        return await db.Escrows.AnyAsync(
            e => e.JobId == jobId
                && e.PayeeId == userId
                && (e.Status == EscrowStatus.Held || e.Status == EscrowStatus.Released),
            ct)
            || await db.JobApplications.AnyAsync(
            a => a.JobId == jobId
                && a.WorkerId == userId,
            ct);
    }
}
