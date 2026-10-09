using Api.Common;
using Api.Features.Auth;

namespace Api.Features.Jobs;

// Stored as text in Postgres; the flow Open -> Assigned -> Done / Cancelled lands in later tasks.
public enum JobStatus
{
    Open,
    Assigned,
    Done,
    Cancelled,
}

// Task 02: persisted job. Status is text, Version maps to the Postgres xmin system column.
public class Job
{
    public Guid Id { get; set; } = GuidV7.NewGuid();
    public Guid OwnerId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public JobStatus Status { get; set; } = JobStatus.Open;
    public bool IsCompletedReported { get; set; }
    // Task 12a: admin-hidden jobs are excluded from the public list.
    public bool Hidden { get; set; }
    public bool IsUrgent { get; set; }
    public double? Lat { get; set; }
    public double? Lng { get; set; }
    public string? LocationText { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public uint Version { get; set; }

    public User Owner { get; set; } = null!;
    public List<JobImage> Images { get; set; } = [];
}
