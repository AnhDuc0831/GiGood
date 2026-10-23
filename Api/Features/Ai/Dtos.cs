namespace Api.Features.Ai;

public sealed record AiChatMessage(string Role, string Content);

public sealed record AiChatRequest(
    string Message,
    List<AiChatMessage>? History = null);

public sealed record JobDraftDto(
    string Title,
    string Category,
    string Description,
    decimal EstimatedPrice,
    bool IsUrgent);

public sealed record JobRecommendationDto(
    Guid Id,
    string Title,
    string Category,
    decimal Price,
    string? LocationText,
    string MatchReason);

public sealed record TaskerRecommendationDto(
    Guid Id,
    string Name,
    string? AvatarUrl,
    double RatingAvg,
    List<string> Skills,
    string? Bio,
    string MatchReason);

public sealed record AiChatResponse(
    string Reply,
    JobDraftDto? JobDraft = null,
    List<JobRecommendationDto>? JobRecommendations = null,
    List<TaskerRecommendationDto>? TaskerRecommendations = null,
    bool IsConfigured = true);

public sealed record DraftJobRequest(string Prompt);

public sealed record AiStatusResponse(
    bool Configured,
    string Model,
    string Message);
