using Api.Features.Escrows;

namespace Api.Features.Jobs;

public sealed record CreateJobRequest(
    string Title,
    string Description,
    string Category,
    decimal Price,
    double? Lat,
    double? Lng,
    string? LocationText,
    List<string>? Images,
    bool IsUrgent = false);

public sealed record UpdateJobRequest(
    string? Title,
    string? Description,
    string? Category,
    decimal? Price,
    string? LocationText,
    double? Lat,
    double? Lng);

public sealed record JobOwnerDto(Guid Id, string Name, string? AvatarUrl, double RatingAvg);
public sealed record JobTaskerDto(Guid Id, string Name, string? AvatarUrl, double RatingAvg);

// `distanceKm` is only set for lat/lng queries.
public sealed record JobDto(
    Guid Id,
    JobOwnerDto Owner,
    string Title,
    string Description,
    string Category,
    decimal Price,
    string Status,
    bool IsCompletedReported,
    double? Lat,
    double? Lng,
    double? DistanceKm,
    string? LocationText,
    List<string> Images,
    bool IsUrgent,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    JobTaskerDto? Tasker = null);

public sealed record JobListResponse(List<JobDto> Jobs, string? NextCursor);

// Task 06 escrow transitions return the updated escrow + the credited/debited wallet balance.
public sealed record JobEscrowResponse(EscrowDto Escrow, decimal Balance);

// Task 07: optional rating on release. The review is created best-effort after the escrow
// has committed, so invalid payloads are skipped (never fail the release) — no validator.
public sealed record ReleaseEscrowRequest(int? Rating, string? Comment);

public sealed record CategoryDto(string Key, string Label, string Icon);
