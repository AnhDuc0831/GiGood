using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Api.Data;
using Api.Features.Notifications;
using Api.Features.Upload;
using FluentValidation;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Api.Features.Auth;

public static class AuthEndpoints
{
    private const string InvalidCredentials = "Số điện thoại hoặc mật khẩu không đúng.";
    private static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(7);

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/register", RegisterAsync);
        group.MapPost("/login", LoginAsync);
        group.MapPost("/refresh", RefreshAsync);
        group.MapPost("/revoke", RevokeAsync); // anonymous: the body carries the refresh token

        app.MapGet("/api/me", GetMeAsync).RequireAuthorization().WithTags("Auth");

        // Task 08: profile edit, avatar upload, dual-role switch and the KYC stub.
        app.MapPatch("/api/me", UpdateMeAsync).RequireAuthorization().WithTags("Auth");
        app.MapPost("/api/me/avatar", UpdateAvatarAsync).RequireAuthorization().DisableAntiforgery().WithTags("Auth");
        app.MapPost("/api/me/verify", VerifyAsync).RequireAuthorization().WithTags("Auth");

        return app;
    }

    private static async Task<Results<Created<AuthResponse>, ValidationProblem, BadRequest<ErrorResponse>, Conflict<ErrorResponse>>> RegisterAsync(
        RegisterRequest request,
        IValidator<RegisterRequest> validator,
        AppDbContext db,
        PasswordHasher hasher,
        JwtProvider jwt,
        NotificationService notifications,
        CancellationToken ct)
    {
        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return TypedResults.ValidationProblem(validation.ToDictionary());
        }

        if (request.Role is not ("seeker" or "tasker"))
        {
            return TypedResults.BadRequest(new ErrorResponse("Vai trò không hợp lệ."));
        }

        if (await db.Users.AnyAsync(u => u.Phone == request.Phone, ct))
        {
            return TypedResults.Conflict(new ErrorResponse("Số điện thoại đã được đăng ký."));
        }

        var user = new User
        {
            Phone = request.Phone,
            PasswordHash = hasher.Hash(request.Password),
            Name = request.Name,
            CurrentRole = request.Role,
            Location = request.Location,
        };

        if (request.TaskerProfile is { } profile)
        {
            user.Skills = JsonSerializer.Serialize(profile.Skills ?? []);
            user.Bio = profile.Bio;
            user.Availability = profile.Availability;
            user.Vehicle = profile.Vehicle;
        }

        var (accessToken, expiresIn) = jwt.CreateAccessToken(user);
        var (rawRefresh, refreshToken) = CreateRefreshToken(user.Id);

        db.Users.Add(user);
        db.RefreshTokens.Add(refreshToken);
        db.Wallets.Add(new Api.Features.Wallet.Wallet { UserId = user.Id, Balance = 0 }); // task 06: one wallet per user

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Unique index on Phone — covers the race between the check above and the insert.
            return TypedResults.Conflict(new ErrorResponse("Số điện thoại đã được đăng ký."));
        }

        // Task 05: welcome notification (post-commit, best-effort — never fails register).
        await notifications.CreateAndSendAsync(
            db,
            user.Id,
            NotificationTypes.Welcome,
            $"Chào mừng {user.Name} đến với GiGood!",
            "Tài khoản của bạn đã được tạo thành công. Hãy bắt đầu khám phá GiGood!",
            jobId: null,
            ct);

        return TypedResults.Created(
            $"/api/users/{user.Id}",
            new AuthResponse(ToDto(user), accessToken, rawRefresh, expiresIn));
    }

    private static async Task<Results<Ok<TokenPair>, ProblemHttpResult, JsonHttpResult<ErrorResponse>>> LoginAsync(
        LoginRequest request,
        IValidator<LoginRequest> validator,
        AppDbContext db,
        PasswordHasher hasher,
        JwtProvider jwt,
        CancellationToken ct)
    {
        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized, detail: InvalidCredentials);
        }

        var user = await db.Users.SingleOrDefaultAsync(u => u.Phone == request.Phone, ct);
        if (user is null || !hasher.Verify(request.Password, user.PasswordHash))
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized, detail: InvalidCredentials);
        }

        // Task 12a: banned accounts cannot log in.
        if (user.Banned)
        {
            return TypedResults.Json(new ErrorResponse("Tài khoản đã bị khoá."), statusCode: StatusCodes.Status403Forbidden);
        }

        var (accessToken, expiresIn) = jwt.CreateAccessToken(user);
        var (rawRefresh, refreshToken) = CreateRefreshToken(user.Id);

        db.RefreshTokens.Add(refreshToken);
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(new TokenPair(accessToken, rawRefresh, expiresIn));
    }

    private static async Task<Results<Ok<TokenPair>, ValidationProblem, ProblemHttpResult, JsonHttpResult<ErrorResponse>>> RefreshAsync(
        TokenRequest request,
        IValidator<TokenRequest> validator,
        AppDbContext db,
        JwtProvider jwt,
        CancellationToken ct)
    {
        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return TypedResults.ValidationProblem(validation.ToDictionary());
        }

        var tokenHash = HashToken(request.RefreshToken);
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == tokenHash, ct);
        if (stored is null || stored.RevokedAt is not null || stored.ExpiresAt <= DateTime.UtcNow)
        {
            return InvalidSession();
        }

        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == stored.UserId, ct);
        if (user is null)
        {
            return InvalidSession();
        }

        // Task 12a: banned accounts cannot rotate their session either.
        if (user.Banned)
        {
            return TypedResults.Json(new ErrorResponse("Tài khoản đã bị khoá."), statusCode: StatusCodes.Status403Forbidden);
        }

        // Rotate-on-use: revoke the presented token and hand out a fresh pair.
        var (accessToken, expiresIn) = jwt.CreateAccessToken(user);
        var (rawRefresh, replacement) = CreateRefreshToken(user.Id);

        stored.RevokedAt = DateTime.UtcNow;
        stored.ReplacedByToken = replacement.TokenHash;
        db.RefreshTokens.Add(replacement);
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(new TokenPair(accessToken, rawRefresh, expiresIn));
    }

    private static async Task<Results<NoContent, ValidationProblem>> RevokeAsync(
        TokenRequest request,
        IValidator<TokenRequest> validator,
        AppDbContext db,
        CancellationToken ct)
    {
        var validation = await validator.ValidateAsync(request, ct);
        if (!validation.IsValid)
        {
            return TypedResults.ValidationProblem(validation.ToDictionary());
        }

        var tokenHash = HashToken(request.RefreshToken);
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == tokenHash, ct);
        if (stored is not null && stored.RevokedAt is null)
        {
            stored.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        return TypedResults.NoContent(); // idempotent: unknown/already-revoked tokens are a no-op
    }

    private static async Task<Results<Ok<MeResponse>, UnauthorizedHttpResult>> GetMeAsync(
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return TypedResults.Unauthorized();
        }

        return TypedResults.Ok(new MeResponse(ToDto(user), Wallet: null)); // wallet lands in task 06
    }

    // Task 08: partial profile update. Null fields are ignored; tasker-profile columns are
    // editable at any time (the role switch below gates actual tasker use).
    private static async Task<Results<Ok<UserDto>, ValidationProblem, UnauthorizedHttpResult>> UpdateMeAsync(
        UpdateProfileRequest request,
        IValidator<UpdateProfileRequest> validator,
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

        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return TypedResults.Unauthorized();
        }

        if (request.Name is not null)
        {
            user.Name = request.Name.Trim();
        }

        if (request.Location is not null)
        {
            user.Location = request.Location.Trim();
        }

        if (request.Bio is not null)
        {
            user.Bio = request.Bio.Trim();
        }

        if (request.Skills is not null)
        {
            user.Skills = JsonSerializer.Serialize(request.Skills);
        }

        if (request.Availability is not null)
        {
            user.Availability = request.Availability;
        }

        if (request.Vehicle is not null)
        {
            user.Vehicle = request.Vehicle;
        }

        if (request.AvatarUrl is not null)
        {
            user.AvatarUrl = request.AvatarUrl;
        }

        await CheckAndAwardBonusAsync(user, db, ct);
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(ToDto(user));
    }

    // Task 08: same validation/storage as /api/upload, then persists the relative url on the caller.
    private static async Task<Results<Ok<AvatarResponse>, BadRequest<ErrorResponse>, UnauthorizedHttpResult>> UpdateAvatarAsync(
        IFormFile file,
        IWebHostEnvironment env,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return TypedResults.Unauthorized();
        }

        var result = await UploadStorage.SaveImageAsync(file, env, ct);
        if (!result.Succeeded)
        {
            return TypedResults.BadRequest(new ErrorResponse(result.Error!));
        }

        user.AvatarUrl = result.Url;
        await CheckAndAwardBonusAsync(user, db, ct);
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(new AvatarResponse(result.Url!));
    }

    // Task 08: dual-role users switch without logout. Becoming a tasker requires a profile.
    private static async Task<Results<Ok<SwitchRoleResponse>, ValidationProblem, BadRequest<ErrorResponse>, UnauthorizedHttpResult>> SwitchRoleAsync(
        SwitchRoleRequest request,
        IValidator<SwitchRoleRequest> validator,
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

        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return TypedResults.Unauthorized();
        }

        if (request.Role == "tasker" && !HasTaskerProfile(user))
        {
            return TypedResults.BadRequest(new ErrorResponse("Vui lòng hoàn thành hồ sơ tasker"));
        }

        user.CurrentRole = request.Role!;
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(new SwitchRoleResponse(user.CurrentRole));
    }

    // Task 08: KYC stub — verification stays false until the real flow lands.
    private static async Task<Results<Ok<VerifyResponse>, UnauthorizedHttpResult>> VerifyAsync(ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = GetUserId(principal);
        if (userId is null) return TypedResults.Unauthorized();
        
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return TypedResults.Unauthorized();

        user.Verified = true;
        await CheckAndAwardBonusAsync(user, db, ct);
        await db.SaveChangesAsync(ct);
        
        return TypedResults.Ok(new VerifyResponse(user.Verified));
    }

    private static async Task CheckAndAwardBonusAsync(User user, AppDbContext db, CancellationToken ct)
    {
        if (user.RegistrationBonusAwarded) return;

        // Step 1 is always true.
        // Step 2: ProfileCompleted
        if (!user.ProfileCompleted)
        {
            user.ProfileCompleted = !string.IsNullOrWhiteSpace(user.AvatarUrl) && !string.IsNullOrWhiteSpace(user.Location);
        }

        // Step 3: Skills verified is user.Verified
        
        if (user.ProfileCompleted && user.Verified)
        {
            user.RegistrationBonusAwarded = true;

            var wallet = await db.Wallets.SingleOrDefaultAsync(w => w.UserId == user.Id, ct);
            if (wallet != null)
            {
                wallet.Balance += 20;
                db.WalletTransactions.Add(new Api.Features.Wallet.WalletTransaction
                {
                    UserId = user.Id,
                    Type = Api.Features.Wallet.WalletTransactionType.TopUp,
                    Amount = 20
                });
            }
        }
    }

    private static ProblemHttpResult InvalidSession() =>
        TypedResults.Problem(
            statusCode: StatusCodes.Status401Unauthorized,
            detail: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");

    private static Guid? GetUserId(ClaimsPrincipal principal)
    {
        // Inbound claim mapping may rename `sub`; accept both shapes.
        var raw = principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var id) ? id : null;
    }

    private static (string RawToken, RefreshToken Entity) CreateRefreshToken(Guid userId)
    {
        var raw = Base64UrlEncode(RandomNumberGenerator.GetBytes(64));
        return (raw, new RefreshToken
        {
            UserId = userId,
            TokenHash = HashToken(raw),
            ExpiresAt = DateTime.UtcNow.Add(RefreshTokenLifetime),
        });
    }

    // SHA256 of the raw token; the raw value is never stored or logged.
    private static string HashToken(string rawToken) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static UserDto ToDto(User user) => new(
        user.Id,
        user.Phone,
        user.Name,
        user.AvatarUrl,
        user.Location,
        user.RatingAvg,
        user.CurrentRole,
        ToTaskerProfileDto(user),
        user.CreatedAt,
        user.IsAdmin,
        new RegistrationProgressDto(true, user.ProfileCompleted, user.Verified, user.RegistrationBonusAwarded));

    private static TaskerProfileDto? ToTaskerProfileDto(User user)
    {
        if (user.Skills is null && user.Bio is null && user.Availability is null && user.Vehicle is null)
        {
            return null;
        }

        return new TaskerProfileDto(
            ParseSkills(user.Skills),
            user.Bio ?? string.Empty,
            user.Availability ?? string.Empty,
            user.Vehicle ?? string.Empty,
            user.Verified);
    }

    private static List<string> ParseSkills(string? skills)
    {
        if (string.IsNullOrWhiteSpace(skills))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(skills) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    // Task 08: a usable tasker profile needs at least one skill/bio/availability/vehicle value.
    private static bool HasTaskerProfile(User user) =>
        ParseSkills(user.Skills).Count > 0
        || !string.IsNullOrWhiteSpace(user.Bio)
        || !string.IsNullOrWhiteSpace(user.Availability)
        || !string.IsNullOrWhiteSpace(user.Vehicle);
}
