using System.Text;
using System.Text.Json;

namespace Api.Features.Ai;

public class GeminiClient
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;
    private readonly string _configuredModel;
    private readonly ILogger<GeminiClient> _logger;

    /// <summary>
    /// SCHEMA CƠ SỞ DỮ LIỆU CỦA GIGOOD ĐỂ AI HIỂU VÀ ĐỌC DỮ LIỆU
    /// (Tương tự như cấu hình Schema trong LibraryManageApp/Service/GeminiClient.cs)
    /// </summary>
    public const string DatabaseSchema = @"
HỆ THỐNG DATABASE GIGOOD (PostgreSQL / Neon DB):

1. Bảng Jobs (Công việc micro-gig):
   - Id (UUID): Mã công việc duy nhất
   - OwnerId (UUID -> Users.Id): Người đăng việc (Seeker)
   - Title (VARCHAR): Tiêu đề công việc
   - Description (TEXT): Mô tả chi tiết yêu cầu, kỹ năng, thời gian
   - Category (VARCHAR): Chỉ gồm 4 danh mục hợp lệ:
     + 'repair': Sửa chữa vặt, kỹ thuật máy tính/laptop, cài win/phần mềm, điện tử
     + 'cleaning': Dọn dẹp phòng trọ, vệ sinh nhà cửa, lau dọn KTX
     + 'delivery': Giao hàng, giao tài liệu & đồ án sinh viên, mua hộ đồ ăn
     + 'helper': Trợ giúp việc vặt, code bài tập C#/CNTT, gia sư, phụ shop, dọn đồ chuyển trọ
   - Price (DECIMAL): Mức thù lao / ngân sách trả cho người làm (VNĐ)
   - Status (VARCHAR): Trạng thái ('Open': Đang chờ nhận, 'Assigned': Đã có người nhận, 'Done': Hoàn tất)
   - LocationText (TEXT): Địa chỉ thực hiện công việc
   - IsUrgent (BOOLEAN): Việc gấp cần làm liền
   - CreatedAt (TIMESTAMP): Thời điểm đăng việc

2. Bảng Users (Người dùng: Seeker và Tasker):
   - Id (UUID): Mã người dùng
   - Name (VARCHAR): Họ và tên
   - Phone (VARCHAR): Số điện thoại
   - CurrentRole (VARCHAR): Vai trò ('seeker' hoặc 'tasker')
   - RatingAvg (DOUBLE): Điểm đánh giá trung bình từ 1.0 đến 5.0 sao
   - Skills (JSONB Array): Danh sách kỹ năng của Tasker (ví dụ: ['repair', 'helper'])
   - Bio (TEXT): Lời giới thiệu kinh nghiệm bản thân
   - Availability (VARCHAR): Thời gian rảnh ('all-day', 'morning', 'afternoon', 'evening', 'weekend')
   - Vehicle (VARCHAR): Phương tiện ('motorbike', 'bicycle', 'none')

3. Bảng Escrows (Ký quỹ tiền công đảm bảo an toàn):
   - JobId (UUID -> Jobs.Id): Công việc được ký quỹ
   - Amount (DECIMAL): Số tiền ký quỹ an toàn
   - Status (VARCHAR): 'Held' (Đang giữ tiền), 'Released' (Đã thanh toán cho Tasker)

4. Bảng Reviews (Đánh giá sau khi hoàn thành):
   - JobId (UUID -> Jobs.Id), Rating (1-5 sao), Comment (Nhận xét)
";

    // Danh sách các model của Google Gemini để tự động chuyển tiếp nếu model chính chưa khả dụng
    private static readonly string[] CandidateModels = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];

    public GeminiClient(IConfiguration configuration, ILogger<GeminiClient> logger)
    {
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(25) };
        _logger = logger;
        _apiKey = configuration["Gemini:ApiKey"]
            ?? configuration["GEMINI_API_KEY"]
            ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY")
            ?? Environment.GetEnvironmentVariable("Gemini__ApiKey")
            ?? "";

        _configuredModel = configuration["Gemini:Model"]
            ?? configuration["GEMINI_MODEL"]
            ?? Environment.GetEnvironmentVariable("GEMINI_MODEL")
            ?? "gemini-2.5-flash";
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey) && _apiKey != "API_KEY" && !_apiKey.StartsWith("YOUR_");

    public string ModelName => _configuredModel;

    public async Task<string> GenerateTextAsync(string prompt, double temperature = 0.2, int maxTokens = 2048, CancellationToken ct = default)
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException("Gemini API Key is not configured.");
        }

        // Ưu tiên model cấu hình, sau đó thử các model dự phòng nếu bị 404
        var modelsToTry = new List<string> { _configuredModel };
        foreach (var m in CandidateModels)
        {
            if (!modelsToTry.Contains(m)) modelsToTry.Add(m);
        }

        string lastError = "";

        foreach (var model in modelsToTry)
        {
            try
            {
                var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={_apiKey}";

                var requestBody = new
                {
                    contents = new[]
                    {
                        new
                        {
                            parts = new[]
                            {
                                new { text = prompt }
                            }
                        }
                    },
                    generationConfig = new
                    {
                        temperature,
                        maxOutputTokens = maxTokens
                    }
                };

                var json = JsonSerializer.Serialize(requestBody);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync(endpoint, content, ct);

                if (response.IsSuccessStatusCode)
                {
                    var responseJson = await response.Content.ReadAsStringAsync(ct);
                    using var doc = JsonDocument.Parse(responseJson);

                    if (doc.RootElement.TryGetProperty("candidates", out var candidates) && candidates.GetArrayLength() > 0)
                    {
                        var text = candidates[0]
                            .GetProperty("content")
                            .GetProperty("parts")[0]
                            .GetProperty("text")
                            .GetString();

                        if (!string.IsNullOrWhiteSpace(text))
                        {
                            return text;
                        }
                    }
                }
                else
                {
                    var errorBody = await response.Content.ReadAsStringAsync(ct);
                    lastError = $"Status {response.StatusCode}: {errorBody}";
                    _logger.LogWarning("Gemini API attempt with model {Model} failed: {Error}", model, lastError);

                    // Nếu lỗi không phải 404 (ví dụ 400 Invalid Key hoặc 429 Quota), dừng lại không thử model khác
                    if ((int)response.StatusCode != 404)
                    {
                        break;
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                lastError = ex.Message;
                _logger.LogWarning(ex, "Gemini call threw exception on model {Model}", model);
            }
        }

        throw new HttpRequestException($"Tất cả các model Gemini đều không phản hồi thành công. Chi tiết lỗi: {lastError}");
    }
}
