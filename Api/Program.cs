using System.Text;
using Api.Data;
using Api.Features.Admin;
using Api.Features.Auth;
using Api.Features.Chat;
using Api.Features.Escrows;
using Api.Features.Jobs;
using Api.Features.Notifications;
using Api.Features.Ratings;
using Api.Features.Upload;
using Api.Features.Wallet;
using Api.Hubs;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Data — Neon Postgres only (UseNpgsql). No SQL Server.
// ---------------------------------------------------------------------------
var connectionString = builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connectionString))
{
    // Placeholder until a real Neon pooled URL is wired via
    // ConnectionStrings__Default (see .env.example). No connection is opened at startup.
    connectionString = builder.Configuration.GetConnectionString("Default");
}

builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

// ---------------------------------------------------------------------------
// Auth — JWT bearer. SignalR hubs receive the token via `access_token` query.
// ---------------------------------------------------------------------------
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
{
    // Dev-only fallback so /health + /swagger run before secrets land (task 01 owns real config).
    jwtKey = "gigood-dev-only-signing-key-32bytes!";
}

// JwtProvider shares the resolved key (same >=32-byte validation).
builder.Configuration["Jwt:Key"] = jwtKey;

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "gigood",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "gigood",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = "sub",
            RoleClaimType = "role",
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken) &&
                    context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            },
        };
    });

builder.Services.AddAuthorization(options =>
{
    // Task 12a: /api/admin surface. JwtProvider emits `is_admin: "true"` for IsAdmin users.
    options.AddPolicy("Admin", policy => policy.RequireClaim("is_admin", "true"));
});

// ---------------------------------------------------------------------------
// Auth slice (task 01) — BCrypt hashing, JWT issuing, FluentValidation rules.
// ---------------------------------------------------------------------------
builder.Services.AddSingleton<PasswordHasher>();
builder.Services.AddSingleton<JwtProvider>();
builder.Services.AddSingleton<IValidator<RegisterRequest>, RegisterRequestValidator>();
builder.Services.AddSingleton<IValidator<LoginRequest>, LoginRequestValidator>();
builder.Services.AddSingleton<IValidator<TokenRequest>, TokenRequestValidator>();

// Task 08: profile edit + role switch validation.
builder.Services.AddSingleton<IValidator<UpdateProfileRequest>, UpdateProfileRequestValidator>();
builder.Services.AddSingleton<IValidator<SwitchRoleRequest>, SwitchRoleRequestValidator>();

// ---------------------------------------------------------------------------
// Jobs slice (task 02) — FluentValidation rules for create/patch.
// ---------------------------------------------------------------------------
builder.Services.AddSingleton<IValidator<CreateJobRequest>, CreateJobRequestValidator>();
builder.Services.AddSingleton<IValidator<UpdateJobRequest>, UpdateJobRequestValidator>();

// ---------------------------------------------------------------------------
// Chat slice (task 04) — FluentValidation rules for create + message body.
// ---------------------------------------------------------------------------
builder.Services.AddSingleton<IValidator<CreateConversationRequest>, CreateConversationRequestValidator>();
builder.Services.AddSingleton<IValidator<SendMessageRequest>, SendMessageRequestValidator>();

// ---------------------------------------------------------------------------
// Wallet slice (task 06) — FluentValidation rules for the topup stub.
// ---------------------------------------------------------------------------
builder.Services.AddSingleton<IValidator<TopUpRequest>, TopUpRequestValidator>();

// ---------------------------------------------------------------------------
// Ratings slice (task 07) — review writes + RatingAvg recompute. The release-escrow
// endpoint reuses the service best-effort.
// ---------------------------------------------------------------------------
builder.Services.AddSingleton<IValidator<CreateRatingRequest>, CreateRatingRequestValidator>();
builder.Services.AddScoped<ReviewService>();

// ---------------------------------------------------------------------------
// Admin slice (task 12a) — shared release/refund escrow ledger used by both the
// job endpoints and /api/admin/escrows/{id}/release|refund.
// ---------------------------------------------------------------------------
builder.Services.AddScoped<EscrowLedgerService>();

// ---------------------------------------------------------------------------
// SignalR (in-box). Hubs are mapped below.
// ---------------------------------------------------------------------------
builder.Services.AddSignalR();

// Task 05: `Clients.User(userId)` resolves through the JWT `sub` claim.
builder.Services.AddSingleton<IUserIdProvider, SubUserIdProvider>();

// Task 05: persisted notifications + post-commit broadcast helper.
builder.Services.AddScoped<NotificationService>();

// ---------------------------------------------------------------------------
// CORS — Expo + web origins, credentials for SignalR.
// ---------------------------------------------------------------------------
const string CorsPolicy = "AllowExpoWeb";
var allowedOrigins = new[]
{
    builder.Configuration["Cors:ExpoOrigin"] ?? "http://localhost:8081",
    builder.Configuration["Cors:WebOrigin"] ?? "http://localhost:5173",
};

builder.Services.AddCors(options =>
    options.AddPolicy(CorsPolicy, policy =>
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()));

// ---------------------------------------------------------------------------
// Swagger (Swashbuckle) — /swagger
// ---------------------------------------------------------------------------
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "GiGood API", Version = "v0.0.1" });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
            },
            Array.Empty<string>()
        },
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

// Dev-only quick-login seed; never blocks startup when the DB is unreachable.
await app.SeedDevAuthAsync();

// Dev-only categories + demo jobs (task 02); same best-effort contract.
await app.SeedJobsAsync();

app.UseSwagger();
app.UseSwaggerUI();

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// Uploads land here and are served by UseStaticFiles below. Explicit provider so the
// folder works even when it did not exist when the host resolved WebRootPath.
var webRoot = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
Directory.CreateDirectory(Path.Combine(webRoot, "uploads"));
app.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(webRoot) });

app.UseCors(CorsPolicy);
app.UseAuthentication();
app.UseAuthorization();

// ---------------------------------------------------------------------------
// Phase 0 endpoints
// ---------------------------------------------------------------------------
app.MapGet("/health", () => TypedResults.Ok(new
{
    status = "ok",
    version = "0.0.1",
    time = DateTime.UtcNow,
})).WithTags("Health");

// Task 02: /api/jobs CRUD, /api/upload, /api/meta/categories (DB-backed).
app.MapMetaEndpoints();
app.MapJobsEndpoints();
app.MapUploadEndpoints();

// Task 06: /api/wallet (balance/transactions/topup) + /api/escrows.
app.MapWalletEndpoints();
app.MapEscrowsEndpoints();

// Task 07: /api/ratings + /api/users/{id}/rating.
app.MapRatingsEndpoints();

// Task 12a: /api/admin/* (Admin policy — is_admin claim).
app.MapAdminEndpoints();

// Task 01: /api/auth/* + /api/me.
app.MapAuthEndpoints();

// Task 04: /api/conversations + realtime ChatHub (token via `access_token` query).
app.MapChatEndpoints();
app.MapHub<ChatHub>("/hubs/chat");

// Task 05: /api/notifications + realtime NotificationHub (server-push only).
app.MapNotificationsEndpoints();
app.MapHub<NotificationHub>("/hubs/notifications");

app.Run();

public partial class Program;
