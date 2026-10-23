using Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Auth;

// Development-only quick-login accounts (Khánh Vy / Minh Quân). Best-effort: an unreachable
// DB or missing migration must never stop the API from starting. Full seed is task 10.
public static class DevSeed
{
    private const string DemoPassword = "123456";

    public static async Task SeedDevAuthAsync(this WebApplication app)
    {
        if (!app.Environment.IsDevelopment())
        {
            return;
        }

        try
        {
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<PasswordHasher>();
            var seeded = false;

            if (!await db.Users.AnyAsync(u => u.Phone == "0901234567"))
            {
                db.Users.Add(new User
                {
                    Phone = "0901234567",
                    Name = "Khánh Vy",
                    PasswordHash = hasher.Hash(DemoPassword),
                    CurrentRole = "seeker",
                    Location = "Quận 1, TP.HCM",
                });
                seeded = true;
            }

            if (!await db.Users.AnyAsync(u => u.Phone == "0912345678"))
            {
                db.Users.Add(new User
                {
                    Phone = "0912345678",
                    Name = "Minh Quân",
                    PasswordHash = hasher.Hash(DemoPassword),
                    CurrentRole = "tasker",
                    Location = "Quận Bình Thạnh, TP.HCM",
                    Skills = "[\"repair\", \"delivery\"]",
                    Bio = "Thợ sửa chữa vặt & giao hàng",
                    Availability = "all-day",
                    Vehicle = "motorbike",
                });
                seeded = true;
            }

            // Task 12a: web admin account (seeded only when the phone is missing).
            if (!await db.Users.AnyAsync(u => u.Phone == "0900000000"))
            {
                db.Users.Add(new User
                {
                    Phone = "0900000000",
                    Name = "Quản trị viên",
                    PasswordHash = hasher.Hash(DemoPassword),
                    CurrentRole = "seeker",
                    IsAdmin = true,
                });
                seeded = true;
            }

            if (seeded)
            {
                await db.SaveChangesAsync();
            }

            // Task 06: backfill one wallet per demo user, only when the row is missing.
            // Demo balances mimic the old Expo demo (Khánh Vy 1.42M / Minh Quân 2.85M).
            var walletsSeeded = false;
            foreach (var (phone, balance) in new (string Phone, decimal Balance)[]
                     {
                         ("0901234567", 1_420_000m),
                         ("0912345678", 2_850_000m),
                     })
            {
                var user = await db.Users.SingleOrDefaultAsync(u => u.Phone == phone);
                if (user is null || await db.Wallets.AnyAsync(w => w.UserId == user.Id))
                {
                    continue;
                }

                db.Wallets.Add(new Api.Features.Wallet.Wallet { UserId = user.Id, Balance = balance });
                walletsSeeded = true;
            }

            if (walletsSeeded)
            {
                await db.SaveChangesAsync();
            }

            // Any other existing user (registered before wallets existed) gets a zero wallet
            // so balance/topup endpoints never 404 in dev. Runs after the save above so the
            // demo rows are already persisted when this query executes.
            var usersWithoutWallet = await db.Users
                .Where(u => !db.Wallets.Any(w => w.UserId == u.Id))
                .ToListAsync();
            if (usersWithoutWallet.Count > 0)
            {
                foreach (var user in usersWithoutWallet)
                {
                    db.Wallets.Add(new Api.Features.Wallet.Wallet { UserId = user.Id, Balance = 0m });
                }

                await db.SaveChangesAsync();
            }
        }
        catch (Exception ex)
        {
            app.Logger.LogWarning(ex, "Dev auth seed skipped (database unavailable).");
        }
    }
}
