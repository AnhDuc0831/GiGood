using System.Text.Json;
using Api.Data;
using Api.Features.Auth;
using Api.Features.Jobs;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Ai;

public class AiAssistantService
{
    private readonly AppDbContext _db;
    private readonly GeminiClient _gemini;
    private readonly ILogger<AiAssistantService> _logger;

    public AiAssistantService(AppDbContext db, GeminiClient gemini, ILogger<AiAssistantService> logger)
    {
        _db = db;
        _gemini = gemini;
        _logger = logger;
    }

    public bool IsConfigured => _gemini.IsConfigured;
    public string ModelName => _gemini.ModelName;

    public async Task<JobDraftDto> DraftJobAsync(string userPrompt, CancellationToken ct = default)
    {
        if (_gemini.IsConfigured)
        {
            try
            {
                var prompt = $@"
Bạn là trợ lý đăng việc thông minh cho ứng dụng GiGood (nền tảng kết nối micro-gig / việc làm vặt tại Việt Nam).
Người dùng muốn đăng công việc với yêu cầu tóm tắt: ""{userPrompt}""

NHIỆM VỤ:
Phân tích yêu cầu trên và tạo ra một bản thảo công việc chi tiết, chuyên nghiệp và thực tế.
Danh mục (category) BẮT BUỘC chọn đúng 1 trong 4 key sau:
- ""repair"": Sửa chữa vặt, kỹ thuật máy tính/điện thoại, cài phần mềm/cài Win, vệ sinh laptop
- ""cleaning"": Dọn dẹp phòng trọ, vệ sinh nhà cửa, lau dọn
- ""delivery"": Giao tài liệu, đồ án, giao hàng nhanh, mua hộ đồ ăn
- ""helper"": Hỗ trợ việc vặt, code bài tập / gia sư, phụ việc shop / quán cafe, bốc vác chuyển trọ

YÊU CẦU OUTPUT:
Chỉ trả về JSON thuần (KHÔNG dùng markdown ```json, KHÔNG có văn bản nào khác ngoài JSON):
{{
  ""title"": ""Tiêu đề ngắn gọn, rõ ràng (30-60 ký tự)"",
  ""category"": ""repair|cleaning|delivery|helper"",
  ""description"": ""Mô tả công việc chi tiết: phạm vi công việc, kỹ năng/dụng cụ cần có, thời gian và địa điểm thực hiện..."",
  ""estimatedPrice"": 100000,
  ""isUrgent"": false
}}";

                var rawResponse = await _gemini.GenerateTextAsync(prompt, temperature: 0.2, maxTokens: 1024, ct: ct);
                var cleanJson = CleanJsonString(rawResponse);
                var draft = JsonSerializer.Deserialize<JobDraftDto>(cleanJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (draft != null && !string.IsNullOrWhiteSpace(draft.Title))
                {
                    return draft;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to draft job via Gemini. Falling back to local template generator.");
            }
        }

        // Local Fallback Generator
        return GenerateLocalJobDraft(userPrompt);
    }

    public async Task<AiChatResponse> ChatAsync(AiChatRequest request, Guid userId, string role, CancellationToken ct = default)
    {
        var isSeeker = string.Equals(role, "seeker", StringComparison.OrdinalIgnoreCase);
        var lowerMsg = request.Message.Trim().ToLowerInvariant();

        // 1. Fetch relevant DB context
        List<Job> userJobs = [];
        List<Job> openJobs = [];
        List<User> taskers = [];

        if (isSeeker)
        {
            userJobs = await _db.Jobs.AsNoTracking()
                .Where(j => j.OwnerId == userId)
                .OrderByDescending(j => j.CreatedAt)
                .Take(5)
                .ToListAsync(ct);

            taskers = await _db.Users.AsNoTracking()
                .Where(u => u.Skills != null || u.Bio != null || u.CurrentRole == "tasker")
                .OrderByDescending(u => u.RatingAvg)
                .Take(10)
                .ToListAsync(ct);
        }
        else
        {
            openJobs = await _db.Jobs.AsNoTracking()
                .Include(j => j.Owner)
                .Where(j => j.Status == JobStatus.Open && !j.Hidden)
                .OrderByDescending(j => j.CreatedAt)
                .Take(15)
                .ToListAsync(ct);
        }

        // 2. Detect intent
        var isJobDraftIntent = isSeeker && (
            lowerMsg.Contains("đăng việc") ||
            lowerMsg.Contains("tạo việc") ||
            lowerMsg.Contains("viết việc") ||
            lowerMsg.Contains("điền form") ||
            lowerMsg.Contains("code bài tập") ||
            lowerMsg.Contains("c#") ||
            lowerMsg.Contains("cần người") ||
            lowerMsg.Contains("nhờ làm") ||
            lowerMsg.Contains("tìm người dọn") ||
            lowerMsg.Contains("giao giúp") ||
            lowerMsg.Contains("tìm thợ"));

        var isFindTaskerIntent = isSeeker && !isJobDraftIntent && (
            lowerMsg.Contains("tìm tasker") ||
            lowerMsg.Contains("gợi ý tasker") ||
            lowerMsg.Contains("ai làm được") ||
            lowerMsg.Contains("ai nhận việc") ||
            lowerMsg.Contains("người nhận việc"));

        var isFindJobsIntent = !isSeeker && (
            lowerMsg.Contains("tìm việc") ||
            lowerMsg.Contains("có việc") ||
            lowerMsg.Contains("việc làm") ||
            lowerMsg.Contains("nhận việc") ||
            lowerMsg.Contains("giao hàng") ||
            lowerMsg.Contains("máy tính") ||
            lowerMsg.Contains("c#") ||
            lowerMsg.Contains("dọn dẹp") ||
            lowerMsg.Contains("gợi ý") ||
            lowerMsg.Contains("quận"));

        // If Gemini is configured, use Gemini for natural language reasoning with real DB context
        if (_gemini.IsConfigured)
        {
            try
            {
                return await ChatWithGeminiAsync(request, userId, role, isSeeker, isJobDraftIntent, isFindTaskerIntent, isFindJobsIntent, userJobs, openJobs, taskers, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Gemini chat failed, falling back to local assistant.");
            }
        }

        // Local Smart Assistant Fallback
        return ChatWithLocalEngine(request, role, isSeeker, isJobDraftIntent, isFindTaskerIntent, isFindJobsIntent, userJobs, openJobs, taskers);
    }

    private async Task<AiChatResponse> ChatWithGeminiAsync(
        AiChatRequest request,
        Guid userId,
        string role,
        bool isSeeker,
        bool isJobDraftIntent,
        bool isFindTaskerIntent,
        bool isFindJobsIntent,
        List<Job> userJobs,
        List<Job> openJobs,
        List<User> taskers,
        CancellationToken ct)
    {
        string dbContextDescription;
        if (isSeeker)
        {
            var jobsSummary = string.Join("\n", userJobs.Select(j => $"- ID: {j.Id}, Title: '{j.Title}', Status: {j.Status}, Price: {j.Price:N0}đ"));
            var taskersSummary = string.Join("\n", taskers.Select(t => $"- ID: {t.Id}, Name: '{t.Name}', Rating: {t.RatingAvg:F1}*, Skills: {t.Skills ?? "[]"}, Bio: '{t.Bio ?? "N/A"}'"));
            dbContextDescription = $@"
Dữ liệu công việc của Seeker hiện tại trong hệ thống:
{jobsSummary}

Danh sách Tasker tiêu biểu trong hệ thống GiGood:
{taskersSummary}";
        }
        else
        {
            var openJobsSummary = string.Join("\n", openJobs.Select(j => $"- ID: {j.Id}, Title: '{j.Title}', Category: {j.Category}, Price: {j.Price:N0}đ, Location: '{j.LocationText}', Desc: '{j.Description}'"));
            dbContextDescription = $@"
Danh sách các công việc ĐANG MỞ (Open) trong hệ thống GiGood:
{openJobsSummary}";
        }

        var systemPrompt = $@"
Bạn là GiGood AI - Trợ lý ảo thông minh của nền tảng GiGood (nền tảng kết nối việc làm vặt / micro-gig tại Việt Nam).
Vai trò của người dùng đang chat: {(isSeeker ? "Người thuê việc (Seeker)" : "Người nhận việc (Tasker)")}.

THÔNG TIN DATABASE HIỆN TẠI TỪ HỆ THỐNG:
{dbContextDescription}

NHIỆM VỤ CỦA BẠN:
1. Trả lời bằng tiếng Việt thân thiện, nhiệt tình, có cấu trúc rõ ràng.
2. Dựa trên câu hỏi của người dùng và dữ liệu Database ở trên để tư vấn chính xác.
3. Nếu Seeker muốn đăng việc hoặc nhờ viết mô tả công việc (ví dụ: 'Code bài tập C#', 'tìm người dọn trọ...'):
   - Tạo trường `jobDraft` với đầy đủ: title, category (repair|cleaning|delivery|helper), description chi tiết, estimatedPrice, isUrgent.
4. Nếu Seeker muốn tìm Tasker phù hợp:
   - Dựa vào danh sách Tasker trong DB, chọn ra 1-3 Tasker phù hợp nhất và điền vào `taskerRecommendations`.
5. Nếu Tasker muốn tìm việc hoặc hỏi công việc phù hợp:
   - Dựa vào danh sách công việc ĐANG MỞ trong DB, chọn ra các công việc phù hợp với từ khóa/yêu cầu và điền vào `jobRecommendations` (kèm matchReason vì sao việc này hợp).

YÊU CẦU ĐỊNH DẠNG TRẢ VỀ:
Trả về duy nhất JSON thuần (KHÔNG dùng markdown ```json):
{{
  ""reply"": ""Lời phản hồi trò chuyện với người dùng, giải thích và hướng dẫn..."",
  ""jobDraft"": null hoặc {{ ""title"": ""..."", ""category"": ""helper"", ""description"": ""..."", ""estimatedPrice"": 100000, ""isUrgent"": false }},
  ""jobRecommendations"": [ {{ ""id"": ""Guid"", ""title"": ""..."", ""category"": ""..."", ""price"": 50000, ""locationText"": ""..."", ""matchReason"": ""..."" }} ],
  ""taskerRecommendations"": [ {{ ""id"": ""Guid"", ""name"": ""..."", ""avatarUrl"": null, ""ratingAvg"": 4.9, ""skills"": [""helper""], ""bio"": ""..."", ""matchReason"": ""..."" }} ]
}}";

        var conversationPrompt = $@"{systemPrompt}

LỊCH SỬ CHAT VÀ TIN NHẮN MỚI CỦA USER:
User: {request.Message}

JSON:";

        var rawResponse = await _gemini.GenerateTextAsync(conversationPrompt, temperature: 0.3, maxTokens: 2048, ct: ct);
        var cleanJson = CleanJsonString(rawResponse);

        try
        {
            var parsed = JsonSerializer.Deserialize<AiChatResponse>(cleanJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (parsed != null && !string.IsNullOrWhiteSpace(parsed.Reply))
            {
                return parsed with { IsConfigured = true };
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse Gemini chat response JSON. Using raw text as reply.");
            return new AiChatResponse(Reply: rawResponse, IsConfigured: true);
        }

        return new AiChatResponse(Reply: rawResponse, IsConfigured: true);
    }

    private AiChatResponse ChatWithLocalEngine(
        AiChatRequest request,
        string role,
        bool isSeeker,
        bool isJobDraftIntent,
        bool isFindTaskerIntent,
        bool isFindJobsIntent,
        List<Job> userJobs,
        List<Job> openJobs,
        List<User> taskers)
    {
        var msg = request.Message;
        var lower = msg.ToLowerInvariant();

        // 1. Seeker wants to draft / post a job
        if (isSeeker && isJobDraftIntent)
        {
            var draft = GenerateLocalJobDraft(msg);
            var reply = $"Tôi đã soạn sẵn bản thảo công việc **'{draft.Title}'** phù hợp với yêu cầu của bạn!\n\n" +
                        $"• **Nhóm việc**: {draft.Category}\n" +
                        $"• **Mức giá gợi ý**: {draft.EstimatedPrice:N0}đ\n" +
                        $"• **Mô tả**: {draft.Description}\n\n" +
                        $"Bạn có thể nhấn nút **'Áp dụng vào Đăng việc'** bên dưới để tự động điền toàn bộ thông tin vào form!";

            return new AiChatResponse(
                Reply: reply,
                JobDraft: draft,
                IsConfigured: _gemini.IsConfigured);
        }

        // 2. Seeker wants to find taskers
        if (isSeeker && isFindTaskerIntent)
        {
            var matched = taskers
                .OrderByDescending(t => t.RatingAvg)
                .Take(3)
                .Select(t => new TaskerRecommendationDto(
                    t.Id,
                    t.Name,
                    t.AvatarUrl,
                    t.RatingAvg,
                    ParseSkills(t.Skills),
                    t.Bio,
                    MatchReason: $"Đánh giá {t.RatingAvg:F1}★, phù hợp với các công việc hỗ trợ và việc vặt."))
                .ToList();

            var reply = matched.Count > 0
                ? $"Dưới đây là các Tasker có uy tín và điểm đánh giá cao trong hệ thống phù hợp với yêu cầu của bạn:"
                : "Hiện tại chưa có Tasker phù hợp trong danh mục này. Bạn có thể đăng việc mới để các bạn sinh viên xung quanh nhận việc nhé!";

            return new AiChatResponse(
                Reply: reply,
                TaskerRecommendations: matched,
                IsConfigured: _gemini.IsConfigured);
        }

        // 3. Tasker looking for jobs
        if (!isSeeker && (isFindJobsIntent || openJobs.Count > 0))
        {
            // Simple keyword filter
            var keywords = lower.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(w => w.Length > 2 && !new[] { "tìm", "việc", "cho", "mình", "có", "nào", "không", "giúp" }.Contains(w))
                .ToList();

            var matchedJobs = openJobs
                .Where(j => keywords.Count == 0 || keywords.Any(k => j.Title.ToLowerInvariant().Contains(k) || j.Description.ToLowerInvariant().Contains(k) || j.Category.ToLowerInvariant().Contains(k)))
                .Take(4)
                .Select(j => new JobRecommendationDto(
                    j.Id,
                    j.Title,
                    j.Category,
                    j.Price,
                    j.LocationText,
                    MatchReason: "Phù hợp với từ khóa bạn tìm kiếm và đang mở nhận việc."))
                .ToList();

            if (matchedJobs.Count == 0 && openJobs.Count > 0)
            {
                matchedJobs = openJobs.Take(3).Select(j => new JobRecommendationDto(
                    j.Id,
                    j.Title,
                    j.Category,
                    j.Price,
                    j.LocationText,
                    MatchReason: "Công việc mới đăng đang tìm Tasker."))
                .ToList();
            }

            var reply = matchedJobs.Count > 0
                ? $"Tôi đã tìm thấy {matchedJobs.Count} công việc phù hợp với yêu cầu của bạn trong cơ sở dữ liệu:"
                : "Hiện tại chưa có công việc mới nào phù hợp với từ khóa này. Bạn hãy quay lại sau hoặc thử từ khóa khác nhé!";

            return new AiChatResponse(
                Reply: reply,
                JobRecommendations: matchedJobs,
                IsConfigured: _gemini.IsConfigured);
        }

        // 4. General conversational reply
        var generalReply = isSeeker
            ? "Xin chào bạn! Tôi là GiGood AI. Tôi có thể giúp bạn:\n" +
              "1. **Tự động viết và điền thông tin đăng việc** (ví dụ: 'Code bài tập C#', 'Dọn phòng trọ').\n" +
              "2. **Tìm Tasker uy tín** phù hợp cho công việc của bạn.\n" +
              "3. **Kiểm tra tiến độ** các công việc bạn đã đăng.\n\n" +
              "Bạn muốn tôi hỗ trợ điều gì hôm nay?"
            : "Xin chào bạn! Tôi là GiGood AI hỗ trợ Tasker. Tôi có thể giúp bạn:\n" +
              "1. **Tìm việc thông minh bằng ngôn ngữ tự nhiên** (ví dụ: 'Tìm việc máy tính quanh quận 1', 'Việc giao hàng trên 50k').\n" +
              "2. **Tư vấn nâng cao hồ sơ** để nhận được nhiều việc hơn.\n\n" +
              "Bạn đang muốn tìm loại công việc nào?";

        if (!_gemini.IsConfigured)
        {
            generalReply += "\n\n*(Lưu ý: Hệ thống hiện đang chạy ở chế độ Trợ lý Mẫu nội bộ. Sau khi thêm GEMINI_API_KEY, bạn sẽ được trải nghiệm AI Gemini đầy đủ!)*";
        }

        return new AiChatResponse(
            Reply: generalReply,
            IsConfigured: _gemini.IsConfigured);
    }

    private static JobDraftDto GenerateLocalJobDraft(string userPrompt)
    {
        var lower = userPrompt.ToLowerInvariant();

        if (lower.Contains("c#") || lower.Contains("code") || lower.Contains("lập trình") || lower.Contains("bài tập"))
        {
            return new JobDraftDto(
                Title: "Hỗ trợ giải & code bài tập C# OOP",
                Category: "helper",
                Description: "Cần bạn sinh viên am hiểu ngôn ngữ C# và lập trình hướng đối tượng (OOP) hỗ trợ giải thích logic và viết code bài tập lớn. Yêu cầu code sạch, có chú thích rõ ràng và chạy đúng yêu cầu đề bài.",
                EstimatedPrice: 100000,
                IsUrgent: false);
        }

        if (lower.Contains("dọn") || lower.Contains("vệ sinh") || lower.Contains("nhà") || lower.Contains("phòng trọ"))
        {
            return new JobDraftDto(
                Title: "Dọn dẹp phòng trọ cuối tuần",
                Category: "cleaning",
                Description: "Cần một bạn sinh viên hỗ trợ quét dọn phòng, lau sàn, rửa chén bát và gom rác sạch sẽ, thời gian hoàn thành khoảng 1.5 - 2 tiếng.",
                EstimatedPrice: 120000,
                IsUrgent: false);
        }

        if (lower.Contains("giao") || lower.Contains("ship") || lower.Contains("tài liệu") || lower.Contains("đồ án") || lower.Contains("cơm"))
        {
            return new JobDraftDto(
                Title: "Giao tài liệu & đồ án sinh viên gấp",
                Category: "delivery",
                Description: "Cần bạn có xe máy giao nhanh túi tài liệu và đồ án từ trường về phòng trọ (~3km), giao cẩn thận tránh làm rách hoặc nhăn giấy tờ.",
                EstimatedPrice: 50000,
                IsUrgent: true);
        }

        if (lower.Contains("laptop") || lower.Contains("máy tính") || lower.Contains("sửa") || lower.Contains("win"))
        {
            return new JobDraftDto(
                Title: "Vệ sinh laptop & cài phần mềm máy tính",
                Category: "repair",
                Description: "Máy tính chạy chậm và bị nóng quạt, cần bạn sinh viên IT hỗ trợ vệ sinh bụi quạt tản nhiệt, tra keo và cài đặt lại bộ ứng dụng học tập cơ bản.",
                EstimatedPrice: 100000,
                IsUrgent: false);
        }

        var title = userPrompt.Length > 50 ? userPrompt[..50] + "..." : userPrompt;
        return new JobDraftDto(
            Title: title,
            Category: "helper",
            Description: $"Yêu cầu: {userPrompt}. Cần bạn sinh viên hỗ trợ hoàn thành đúng giờ, cẩn thận và nhiệt tình.",
            EstimatedPrice: 90000,
            IsUrgent: false);
    }

    private static List<string> ParseSkills(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static string CleanJsonString(string text)
    {
        var cleaned = text.Trim();
        if (cleaned.StartsWith("```json", StringComparison.OrdinalIgnoreCase))
        {
            cleaned = cleaned[7..];
        }
        else if (cleaned.StartsWith("```"))
        {
            cleaned = cleaned[3..];
        }

        if (cleaned.EndsWith("```"))
        {
            cleaned = cleaned[..^3];
        }

        return cleaned.Trim();
    }
}
