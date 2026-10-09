namespace Api.Features.Auth;

public sealed record RegisterRequest(
    string Name,
    string Phone,
    string Password,
    string Location,
    string Role,
    TaskerProfileRequest? TaskerProfile);

public sealed record TaskerProfileRequest(
    List<string>? Skills,
    string? Bio,
    string? Availability,
    string? Vehicle);

public sealed record LoginRequest(string Phone, string Password);

// Shared by /refresh and /revoke — the opaque token travels in the body (anonymous revoke).
public sealed record TokenRequest(string RefreshToken);

public sealed record AuthResponse(UserDto User, string AccessToken, string RefreshToken, int ExpiresIn);

public sealed record TokenPair(string AccessToken, string RefreshToken, int ExpiresIn);

public sealed record UserDto(
    Guid Id,
    string Phone,
    string Name,
    string? AvatarUrl,
    string? Location,
    double RatingAvg,
    string CurrentRole,
    TaskerProfileDto? TaskerProfile,
    DateTime CreatedAt,
    bool IsAdmin,
    RegistrationProgressDto RegistrationProgress);

public sealed record TaskerProfileDto(List<string> Skills, string Bio, string Availability, string Vehicle, bool Verified);

public sealed record RegistrationProgressDto(bool Step1_PhoneVerified, bool Step2_ProfileCompleted, bool Step3_SkillsVerified, bool BonusAwarded);

// `wallet` stays null until task 06.
public sealed record MeResponse(UserDto User, object? Wallet);

public sealed record ErrorResponse(string Message);

// Task 08: partial profile update — every field is optional, null means "leave unchanged".
public sealed record UpdateProfileRequest(
    string? Name,
    string? Location,
    string? Bio,
    List<string>? Skills,
    string? Availability,
    string? Vehicle,
    string? AvatarUrl);

public sealed record SwitchRoleRequest(string? Role);

public sealed record SwitchRoleResponse(string Role);

public sealed record AvatarResponse(string AvatarUrl);

// Task 08: KYC stub — real verification is deferred.
public sealed record VerifyResponse(bool Verified);
