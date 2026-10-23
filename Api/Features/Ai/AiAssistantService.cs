using System.Text.Json;
using System.Text.RegularExpressions;
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

    // =========================================================================
    // 1. TỰ ĐỘNG SOẠN & ĐIỀN BÀI ĐĂNG VIỆC CHO SEEKER (DỰA TRÊN YÊU CẦU NGƯỜI DÙNG)
    // =========================================================================
    public async Task<JobDraftDto> DraftJobAsync(string userPrompt, CancellationToken ct = default)
    {
        if (_gemini.IsConfigured)
        {
            try
            {
                var prompt = $@"
Bạn là trợ lý đăng việc thông minh cho ứng dụng GiGood (nền tảng kết nối micro-gig / việc làm vặt tại Việt Nam).
Người dùng nhập yêu cầu: ""{userPrompt}""

NHIỆM VỤ:
Tạo bản thảo công việc đầy đủ, rõ ràng và hấp dẫn.
Danh mục (category) BẮT BUỘC chọn đúng 1 trong 4 loại sau:
- 'repair': Kỹ thuật máy tính, vệ sinh laptop, cài Win/phần mềm, sửa chữa điện tử vặt
- 'cleaning': Dọn dẹp phòng trọ, vệ sinh nhà cửa, lau dọn KTX
- 'delivery': Giao hàng, giao tài liệu/đồ án, mua hộ đồ ăn
- 'helper': Hỗ trợ code bài tập C#/CNTT, gia sư, phụ quán/shop, dọn chuyển đồ phòng trọ

YÊU CẦU OUTPUT:
Trả về duy nhất JSON thuần (KHÔNG có văn bản nào ngoài JSON, không markdown):
{{
  ""title"": ""Tiêu đề ngắn gọn, rõ ràng (30-60 ký tự)"",
  ""category"": ""repair|cleaning|delivery|helper"",
  ""description"": ""Mô tả công việc chi tiết: phạm vi công việc, kỹ năng cần có, thời gian và địa điểm thực hiện..."",
  ""estimatedPrice"": 100000,
  ""isUrgent"": false
}}";

                var rawResponse = await _gemini.GenerateTextAsync(prompt, temperature: 0.2, maxTokens: 1024, ct: ct);
                var draft = ExtractJson<JobDraftDto>(rawResponse);
                if (draft != null && !string.IsNullOrWhiteSpace(draft.Title) && !string.IsNullOrWhiteSpace(draft.Category))
                {
                    return NormalizeDraft(draft);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Gemini draft failed, using local smart generator.");
            }
        }

        return GenerateSmartLocalJobDraft(userPrompt);
    }

    // =========================================================================
    // 2. CHATBOX AI ĐỌC DỮ LIỆU DATABASE ĐỂ HỖ TRỢ SEEKER & TASKER
    // =========================================================================
    public async Task<AiChatResponse> ChatAsync(AiChatRequest request, Guid userId, string role, CancellationToken ct = default)
    {
        var isSeeker = string.Equals(role, "seeker", StringComparison.OrdinalIgnoreCase);
        var message = request.Message.Trim();
        var lower = message.ToLowerInvariant();

        // ---------------------------------------------------------------------
        // BƯỚC 1: TRUY VẤN ĐỌC DỮ LIỆU THỰC TẾ TỪ POSTGRESQL DATABASE
        // ---------------------------------------------------------------------
        List<Job> userJobs = [];
        List<Job> openJobs = [];
        List<User> taskers = [];

        if (isSeeker)
        {
            // Seeker: Đọc các công việc Seeker đã đăng trong hệ thống
            userJobs = await _db.Jobs.AsNoTracking()
                .Where(j => j.OwnerId == userId)
                .OrderByDescending(j => j.CreatedAt)
                .Take(5)
                .ToListAsync(ct);

            // Seeker: Đọc danh sách các Tasker có uy tín và kỹ năng từ bảng Users
            taskers = await _db.Users.AsNoTracking()
                .Where(u => u.Skills != null || u.Bio != null || u.CurrentRole == "tasker")
                .OrderByDescending(u => u.RatingAvg)
                .Take(15)
                .ToListAsync(ct);
        }
        else
        {
            // Tasker: ĐỌC TRỰC TIẾP CÁC CÔNG VIỆC ĐANG MỞ (STATUS = OPEN) TỪ DATABASE
            openJobs = await _db.Jobs.AsNoTracking()
                .Include(j => j.Owner)
                .Where(j => j.Status == JobStatus.Open && !j.Hidden)
                .OrderByDescending(j => j.CreatedAt)
                .Take(20)
                .ToListAsync(ct);
        }

        // ---------------------------------------------------------------------
        // BƯỚC 2: PHÂN TÍCH Ý ĐỊNH (INTENT RECOGNITION)
        // ---------------------------------------------------------------------
        var isJobDraftIntent = isSeeker && (
            lower.Contains("đăng việc") ||
            lower.Contains("tạo việc") ||
            lower.Contains("viết việc") ||
            lower.Contains("điền việc") ||
            lower.Contains("điền form") ||
            lower.Contains("code") ||
            lower.Contains("c#") ||
            lower.Contains("bài tập") ||
            lower.Contains("cần người") ||
            lower.Contains("nhờ làm") ||
            lower.Contains("tìm người dọn") ||
            lower.Contains("giao giúp") ||
            lower.Contains("cần tìm") ||
            lower.Contains("thuê người"));

        var isFindTaskerIntent = isSeeker && !isJobDraftIntent && (
            lower.Contains("tìm tasker") ||
            lower.Contains("gợi ý tasker") ||
            lower.Contains("ai làm được") ||
            lower.Contains("ai nhận việc") ||
            lower.Contains("thợ giỏi") ||
            lower.Contains("người nhận việc"));

        var isCheckMyJobsIntent = isSeeker && !isJobDraftIntent && !isFindTaskerIntent && (
            lower.Contains("việc của tôi") ||
            lower.Contains("tiến độ") ||
            lower.Contains("đã đăng") ||
            lower.Contains("trạng thái"));

        var isFindJobsIntent = !isSeeker && (
            lower.Contains("tìm việc") ||
            lower.Contains("có việc") ||
            lower.Contains("việc làm") ||
            lower.Contains("nhận việc") ||
            lower.Contains("lọc việc") ||
            lower.Contains("giao hàng") ||
            lower.Contains("máy tính") ||
            lower.Contains("c#") ||
            lower.Contains("dọn dẹp") ||
            lower.Contains("quận") ||
            lower.Contains("lương"));

        // ---------------------------------------------------------------------
        // BƯỚC 3: XỬ LÝ VỚI GEMINI AI HOẶC BỘ XỬ LÝ THÔNG MINH NỘI BỘ
        // ---------------------------------------------------------------------
        if (_gemini.IsConfigured)
        {
            try
            {
                var geminiResponse = await ProcessWithGeminiAsync(
                    message, isSeeker, isJobDraftIntent, isFindTaskerIntent, isFindJobsIntent, isCheckMyJobsIntent,
                    userJobs, openJobs, taskers, ct);

                if (geminiResponse != null && !string.IsNullOrWhiteSpace(geminiResponse.Reply))
                {
                    return geminiResponse;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Gemini process failed. Falling back to local smart engine.");
            }
        }

        // BỘ PHÂN TÍCH NỘI BỘ (LOCAL SMART ENGINE) - ĐẢM BẢO ỔN ĐỊNH 100%
        return ProcessWithSmartLocalEngine(
            message, isSeeker, isJobDraftIntent, isFindTaskerIntent, isFindJobsIntent, isCheckMyJobsIntent,
            userJobs, openJobs, taskers);
    }

    private async Task<AiChatResponse?> ProcessWithGeminiAsync(
        string message,
        bool isSeeker,
        bool isJobDraftIntent,
        bool isFindTaskerIntent,
        bool isFindJobsIntent,
        bool isCheckMyJobsIntent,
        List<Job> userJobs,
        List<Job> openJobs,
        List<User> taskers,
        CancellationToken ct)
    {
        // Chuẩn bị dữ liệu từ Database để cung cấp cho Gemini
        string dbContext;
        if (isSeeker)
        {
            var jobsList = string.Join("\n", userJobs.Select(j => $"• [JobId: {j.Id}] '{j.Title}' (Trạng thái: {j.Status}, Giá: {j.Price:N0}đ)"));
            var taskersList = string.Join("\n", taskers.Select(t => $"• [TaskerId: {t.Id}] Tên: '{t.Name}' - Đánh giá: {t.RatingAvg:F1}★ - Kỹ năng: {t.Skills ?? "[]"} - Giới thiệu: '{t.Bio ?? "N/A"}'"));
            dbContext = $@"
DỮ LIỆU DATABASE THỰC TẾ CỦA HỆ THỐNG GIGOOD:
- Danh sách công việc của Seeker:
{jobsList}

- Danh sách Tasker tiêu biểu trong Database:
{taskersList}";
        }
        else
        {
            var openJobsList = string.Join("\n", openJobs.Select(j => $"• [JobId: {j.Id}] Tiêu đề: '{j.Title}' | Danh mục: {j.Category} | Giá: {j.Price:N0}đ | Địa chỉ: '{j.LocationText ?? "Chưa có"}' | Mô tả: '{j.Description}'"));
            dbContext = $@"
DỮ LIỆU DATABASE THỰC TẾ - CÁC CÔNG VIỆC ĐANG MỞ (STATUS = OPEN):
{openJobsList}";
        }

        var prompt = $@"
{GeminiClient.DatabaseSchema}

{dbContext}

VAI TRÒ NGƯỜI ĐANG CHAT: {(isSeeker ? "Seeker (Người đăng việc)" : "Tasker (Người nhận việc)")}
CÂU HỎI CỦA NGƯỜI DÙNG: ""{message}""

QUY TẮC PHẢN HỒI (RẤT QUAN TRỌNG):
1. Bạn là Trợ lý AI GiGood. Trả lời bằng tiếng Việt thân thiện, nhiệt tình.
2. NẾU SEEKER MUỐN ĐĂNG VIỆC (ví dụ: 'Code bài tập C#', 'Dọn phòng', 'Giao đồ'...):
   - BẮT BUỘC tạo `jobDraft` với đầy đủ:
     + title: Tiêu đề rõ ràng
     + category: 'repair' | 'cleaning' | 'delivery' | 'helper'
     + description: Mô tả chi tiết các yêu cầu, công cụ, hướng dẫn
     + estimatedPrice: Giá đề xuất hợp lý bằng số nguyên
     + isUrgent: boolean
3. NẾU TASKER TÌM VIỆC THEO TỪ KHÓA / NGÔN NGỮ TỰ NHIÊN:
   - Dựa vào danh sách công việc ĐANG MỞ trong Database ở trên, chọn ra các công việc phù hợp với từ khóa và điền vào `jobRecommendations` (kèm đúng `id` trong DB và `matchReason`).
4. NẾU SEEKER TÌM TASKER:
   - Dựa vào danh sách Tasker trong Database, chọn 1-3 người phù hợp và điền vào `taskerRecommendations`.

ĐỊNH DẠNG TRẢ VỀ:
Trả về JSON thuần duy nhất:
{{
  ""reply"": ""Nội dung trả lời và hướng dẫn người dùng bằng tiếng Việt..."",
  ""jobDraft"": null hoặc {{ ""title"": ""..."", ""category"": ""helper"", ""description"": ""..."", ""estimatedPrice"": 100000, ""isUrgent"": false }},
  ""jobRecommendations"": [ {{ ""id"": ""UUID"", ""title"": ""..."", ""category"": ""..."", ""price"": 50000, ""locationText"": ""..."", ""matchReason"": ""..."" }} ],
  ""taskerRecommendations"": [ {{ ""id"": ""UUID"", ""name"": ""..."", ""avatarUrl"": null, ""ratingAvg"": 4.9, ""skills"": [""helper""], ""bio"": ""..."", ""matchReason"": ""..."" }} ]
}}";

        var rawResponse = await _gemini.GenerateTextAsync(prompt, temperature: 0.25, maxTokens: 2048, ct: ct);
        var parsed = ExtractJson<AiChatResponse>(rawResponse);

        if (parsed != null && !string.IsNullOrWhiteSpace(parsed.Reply))
        {
            return parsed with { IsConfigured = true };
        }

        // Nếu Gemini chỉ trả lời text thuần mà không ra JSON
        if (!string.IsNullOrWhiteSpace(rawResponse))
        {
            // Tự động gắn draft nếu người dùng có ý định đăng việc
            JobDraftDto? draft = isJobDraftIntent ? GenerateSmartLocalJobDraft(message) : null;
            return new AiChatResponse(Reply: rawResponse, JobDraft: draft, IsConfigured: true);
        }

        return null;
    }

    private AiChatResponse ProcessWithSmartLocalEngine(
        string message,
        bool isSeeker,
        bool isJobDraftIntent,
        bool isFindTaskerIntent,
        bool isFindJobsIntent,
        bool isCheckMyJobsIntent,
        List<Job> userJobs,
        List<Job> openJobs,
        List<User> taskers)
    {
        var lower = message.ToLowerInvariant();

        // 1. Seeker muốn soạn và điền bài đăng việc
        if (isSeeker && isJobDraftIntent)
        {
            var draft = GenerateSmartLocalJobDraft(message);
            var reply = $"Tôi đã soạn sẵn nội dung bài đăng việc **'{draft.Title}'** phù hợp với yêu cầu của bạn!\n\n" +
                        $"• **Nhóm việc**: {GetCategoryName(draft.Category)}\n" +
                        $"• **Mức giá gợi ý**: {draft.EstimatedPrice:N0}đ\n" +
                        $"• **Mô tả công việc**: {draft.Description}\n\n" +
                        $"👉 Bạn hãy bấm nút **'Áp dụng vào Đăng việc ngay'** bên dưới để tự động điền toàn bộ thông tin này vào form!";

            return new AiChatResponse(
                Reply: reply,
                JobDraft: draft,
                IsConfigured: _gemini.IsConfigured);
        }

        // 2. Seeker tìm Tasker phù hợp trong Database
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
                    MatchReason: $"Đánh giá cao {t.RatingAvg:F1}★, kỹ năng phù hợp và có phản hồi nhanh."))
                .ToList();

            var reply = matched.Count > 0
                ? $"Dưới đây là các Tasker có uy tín và điểm đánh giá cao trong Database phù hợp với yêu cầu của bạn:"
                : "Hiện tại chưa có Tasker phù hợp trong danh mục này. Bạn có thể đăng việc mới để các bạn sinh viên xung quanh nhận việc nhé!";

            return new AiChatResponse(
                Reply: reply,
                TaskerRecommendations: matched,
                IsConfigured: _gemini.IsConfigured);
        }

        // 3. Seeker hỏi về việc đã đăng
        if (isSeeker && isCheckMyJobsIntent)
        {
            if (userJobs.Count == 0)
            {
                return new AiChatResponse(
                    Reply: "Bạn hiện chưa có công việc nào trong hệ thống. Hãy thử nhập yêu cầu như *'Code bài tập C#'* để tôi tạo bài đăng giúp bạn nhé!",
                    IsConfigured: _gemini.IsConfigured);
            }

            var summary = string.Join("\n", userJobs.Select(j =>
                $"• **{j.Title}** — Trạng thái: **{GetStatusName(j.Status)}** ({j.Price:N0}đ)"));

            return new AiChatResponse(
                Reply: $"Dưới đây là các công việc bạn đã đăng gần đây:\n\n{summary}\n\nBạn có thể vào tab **'Việc của tôi'** để xem chi tiết từng công việc.",
                IsConfigured: _gemini.IsConfigured);
        }

        // 4. Tasker tìm việc từ Database qua từ khóa / ngôn ngữ tự nhiên
        if (!isSeeker && (isFindJobsIntent || openJobs.Count > 0))
        {
            var stopWords = new HashSet<string> { "tìm", "việc", "cho", "mình", "có", "nào", "không", "giúp", "với", "hỏi", "đang", "làm", "ở" };
            var keywords = lower.Split(new[] { ' ', ',', '.', '?' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(w => w.Length >= 2 && !stopWords.Contains(w))
                .ToList();

            var matched = openJobs
                .Where(j =>
                {
                    if (keywords.Count == 0) return true;
                    var text = $"{j.Title} {j.Description} {j.Category} {j.LocationText}".ToLowerInvariant();
                    return keywords.Any(k => text.Contains(k));
                })
                .Take(5)
                .Select(j => new JobRecommendationDto(
                    j.Id,
                    j.Title,
                    j.Category,
                    j.Price,
                    j.LocationText,
                    MatchReason: $"Phù hợp với từ khóa bạn tìm kiếm, thù lao {j.Price:N0}đ và đang mở nhận việc."))
                .ToList();

            if (matched.Count == 0 && openJobs.Count > 0)
            {
                matched = openJobs.Take(3).Select(j => new JobRecommendationDto(
                    j.Id,
                    j.Title,
                    j.Category,
                    j.Price,
                    j.LocationText,
                    MatchReason: "Công việc mới nhất đang chờ Tasker nhận việc.")).ToList();
            }

            var reply = matched.Count > 0
                ? $"Tôi đã quét Database và tìm thấy {matched.Count} công việc phù hợp với bạn:\n(Bấm 'Xem chi tiết & nhận việc' để ứng tuyển ngay!)"
                : "Hiện tại chưa có công việc nào mở phù hợp với từ khóa này. Bạn hãy thử từ khóa khác nhé!";

            return new AiChatResponse(
                Reply: reply,
                JobRecommendations: matched,
                IsConfigured: _gemini.IsConfigured);
        }

        // 5. Phản hồi chào hỏi chung
        var defaultReply = isSeeker
            ? "Xin chào bạn! Tôi là GiGood AI. Tôi có thể giúp bạn:\n" +
              "1. **Tự động viết và điền form đăng việc** (ví dụ: 'Code bài tập C#', 'Dọn phòng trọ').\n" +
              "2. **Tìm Tasker uy tín** từ cơ sở dữ liệu hệ thống.\n" +
              "3. **Kiểm tra tiến độ** các công việc bạn đã đăng.\n\n" +
              "Bạn muốn tôi hỗ trợ điều gì?"
            : "Xin chào bạn! Tôi là GiGood AI dành cho Tasker. Tôi có thể giúp bạn:\n" +
              "1. **Tìm việc thông minh từ Database** bằng từ khóa tự nhiên (ví dụ: 'Tìm việc máy tính', 'Việc giao hàng trên 50k').\n" +
              "2. **Tư vấn hồ sơ** để tăng cơ hội nhận việc.\n\n" +
              "Bạn muốn tìm loại công việc nào hôm nay?";

        return new AiChatResponse(
            Reply: defaultReply,
            IsConfigured: _gemini.IsConfigured);
    }

    // =========================================================================
    // 3. TIỆN ÍCH SOẠN THẢO THÔNG MINH CHO MỌI CHỦ ĐỀ
    // =========================================================================
    private static JobDraftDto GenerateSmartLocalJobDraft(string userPrompt)
    {
        var lower = userPrompt.ToLowerInvariant();

        // Chủ đề 1: Code bài tập C# / CNTT / Lập trình
        if (lower.Contains("c#") || lower.Contains("code") || lower.Contains("lập trình") || lower.Contains("bài tập") || lower.Contains("oop") || lower.Contains("it"))
        {
            return new JobDraftDto(
                Title: "Hỗ trợ giải & code bài tập C# / .NET",
                Category: "helper",
                Description: "Cần bạn sinh viên hoặc lập trình viên am hiểu C# và lập trình hướng đối tượng (OOP) hỗ trợ giải bài tập lớn. Yêu cầu viết code sạch, chú thích logic rõ ràng, kiểm tra chạy không lỗi và giải thích cách hoạt động.",
                EstimatedPrice: 100000,
                IsUrgent: false);
        }

        // Chủ đề 2: Dọn dẹp phòng trọ / KTX
        if (lower.Contains("dọn") || lower.Contains("vệ sinh") || lower.Contains("phòng trọ") || lower.Contains("nhà") || lower.Contains("rác"))
        {
            return new JobDraftDto(
                Title: "Dọn dẹp phòng trọ cuối tuần",
                Category: "cleaning",
                Description: "Cần 1 bạn sinh viên phụ quét dọn phòng trọ, lau sàn, cọ rửa bồn rửa/toilet và gom rác sạch sẽ trước khi trả phòng. Thời gian làm khoảng 1.5 - 2 tiếng, đồ dùng vệ sinh có sẵn tại phòng.",
                EstimatedPrice: 120000,
                IsUrgent: false);
        }

        // Chủ đề 3: Giao hàng / Giao tài liệu / Mua hộ
        if (lower.Contains("giao") || lower.Contains("ship") || lower.Contains("tài liệu") || lower.Contains("đồ án") || lower.Contains("cơm") || lower.Contains("mua"))
        {
            return new JobDraftDto(
                Title: "Giao tài liệu & đồ án sinh viên gấp",
                Category: "delivery",
                Description: "Cần bạn có xe máy giao nhanh túi tài liệu và đồ án từ trường sang KTX / nhà trọ (~3km). Yêu cầu giao cẩn thận, không làm gập rách hay dính ướt giấy tờ.",
                EstimatedPrice: 50000,
                IsUrgent: true);
        }

        // Chủ đề 4: Máy tính / Laptop / Cài Win / Phần mềm
        if (lower.Contains("laptop") || lower.Contains("máy tính") || lower.Contains("win") || lower.Contains("office") || lower.Contains("quạt") || lower.Contains("sửa"))
        {
            return new JobDraftDto(
                Title: "Vệ sinh laptop & cài phần mềm máy tính",
                Category: "repair",
                Description: "Laptop bị nóng quạt và chạy chậm, cần bạn sinh viên am hiểu kỹ thuật máy tính hỗ trợ thổi bụi tản nhiệt, tra keo tản nhiệt và cài đặt lại bộ ứng dụng văn phòng cơ bản.",
                EstimatedPrice: 100000,
                IsUrgent: false);
        }

        // Chủ đề 5: Chuyển trọ / Bê đồ / Phụ việc shop
        if (lower.Contains("chuyển") || lower.Contains("bê") || lower.Contains("vác") || lower.Contains("đồ") || lower.Contains("shop"))
        {
            return new JobDraftDto(
                Title: "Phụ dọn & chuyển đồ phòng trọ",
                Category: "helper",
                Description: "Cần 1 bạn sinh viên phụ bê vác đồ đạc nhẹ (vali quần áo, sách vở, quạt máy) chuyển sang phòng trọ mới gần trường. Quãng đường chuyển ngắn, thời gian làm khoảng 1.5 tiếng.",
                EstimatedPrice: 120000,
                IsUrgent: false);
        }

        // Mặc định cho mọi yêu cầu khác
        var cleanTitle = userPrompt.Length > 45 ? userPrompt[..45] + "..." : userPrompt;
        return new JobDraftDto(
            Title: $"Nhờ hỗ trợ: {cleanTitle}",
            Category: "helper",
            Description: $"Yêu cầu công việc: {userPrompt}.\nCần bạn sinh viên nhận việc hỗ trợ hoàn thành cẩn thận, đúng giờ và nhiệt tình.",
            EstimatedPrice: 80000,
            IsUrgent: false);
    }

    private static JobDraftDto NormalizeDraft(JobDraftDto draft)
    {
        var cat = draft.Category.Trim().ToLowerInvariant();
        if (!JobCategories.All.Contains(cat))
        {
            cat = "helper";
        }

        var price = draft.EstimatedPrice <= 0 ? 100000 : draft.EstimatedPrice;
        return draft with { Category = cat, EstimatedPrice = price };
    }

    private static T? ExtractJson<T>(string text) where T : class
    {
        if (string.IsNullOrWhiteSpace(text)) return null;

        // 1. Thử parse trực tiếp
        try
        {
            var cleaned = CleanMarkdown(text);
            var res = JsonSerializer.Deserialize<T>(cleaned, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (res != null) return res;
        }
        catch { }

        // 2. Tìm khối giữa { ... }
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start >= 0 && end > start)
        {
            try
            {
                var sub = text.Substring(start, end - start + 1);
                var res = JsonSerializer.Deserialize<T>(sub, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (res != null) return res;
            }
            catch { }
        }

        return null;
    }

    private static string CleanMarkdown(string text)
    {
        var s = text.Trim();
        if (s.StartsWith("```json", StringComparison.OrdinalIgnoreCase))
        {
            s = s[7..];
        }
        else if (s.StartsWith("```"))
        {
            s = s[3..];
        }

        if (s.EndsWith("```"))
        {
            s = s[..^3];
        }

        return s.Trim();
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

    private static string GetCategoryName(string cat) => cat switch
    {
        "repair" => "Sửa chữa / Kỹ thuật",
        "cleaning" => "Dọn dẹp",
        "delivery" => "Giao hàng",
        "helper" => "Hỗ trợ / Việc vặt",
        _ => cat,
    };

    private static string GetStatusName(JobStatus status) => status switch
    {
        JobStatus.Open => "Đang tìm người",
        JobStatus.Assigned => "Đã có người nhận",
        JobStatus.Done => "Đã hoàn thành",
        JobStatus.Cancelled => "Đã hủy",
        _ => status.ToString(),
    };
}
