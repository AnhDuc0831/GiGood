namespace Api.Features.Auth;

// Task 01: Users(Id Guid PK, Phone unique, PasswordHash, Name, AvatarUrl, RatingAvg,
// CurrentRole, tasker profile columns, CreatedAt). Admin/Banned flags landed in task 12.
public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Phone { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public double RatingAvg { get; set; }
    public string CurrentRole { get; set; } = "seeker";
    public string? Location { get; set; }

    // Task 12a: admin surface + login/refresh block.
    public bool IsAdmin { get; set; }
    public bool Banned { get; set; }

    // Tasker profile columns — null for pure seekers. Skills is a jsonb array of category keys.
    public string? Skills { get; set; }
    public string? Bio { get; set; }
    public string? Availability { get; set; }
    public string? Vehicle { get; set; }
    public bool Verified { get; set; }

    public bool ProfileCompleted { get; set; }
    public bool RegistrationBonusAwarded { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
