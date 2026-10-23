using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Api.Features.Ai;

public static class AiEndpoints
{
    public static IEndpointRouteBuilder MapAiEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/ai").WithTags("AI");

        group.MapGet("/status", GetStatusAsync);
        group.MapPost("/chat", ChatAsync).RequireAuthorization();
        group.MapPost("/draft-job", DraftJobAsync).RequireAuthorization();

        return app;
    }

    private static Ok<AiStatusResponse> GetStatusAsync(AiAssistantService ai)
    {
        return TypedResults.Ok(new AiStatusResponse(
            Configured: ai.IsConfigured,
            Model: ai.ModelName,
            Message: ai.IsConfigured
                ? $"Gemini AI ({ai.ModelName}) is ready."
                : "Gemini API key is not configured. Running in local smart assistant mode."));
    }

    private static async Task<Results<Ok<AiChatResponse>, UnauthorizedHttpResult, BadRequest<string>>> ChatAsync(
        AiChatRequest request,
        ClaimsPrincipal principal,
        AiAssistantService ai,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return TypedResults.BadRequest("Tin nhắn không được để trống.");
        }

        var role = principal.FindFirstValue("role") ?? principal.FindFirstValue(ClaimTypes.Role) ?? "seeker";
        var response = await ai.ChatAsync(request, userId.Value, role, ct);
        return TypedResults.Ok(response);
    }

    private static async Task<Results<Ok<JobDraftDto>, UnauthorizedHttpResult, BadRequest<string>>> DraftJobAsync(
        DraftJobRequest request,
        ClaimsPrincipal principal,
        AiAssistantService ai,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Prompt))
        {
            return TypedResults.BadRequest("Yêu cầu công việc không được để trống.");
        }

        var draft = await ai.DraftJobAsync(request.Prompt, ct);
        return TypedResults.Ok(draft);
    }

    private static Guid? GetUserId(ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var id) ? id : null;
    }
}
