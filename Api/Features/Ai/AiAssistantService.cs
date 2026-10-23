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
                var geminiDraft = await DraftJobWithGeminiAsync(userPrompt, ct);
                if (geminiDraft?.JobDraft != null)
                {
                    return geminiDraft.JobDraft;
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

        User? currentUser = null;
        if (isSeeker)
        {
            currentUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct);

            // Seeker: Đọc các công việc Seeker đã đăng trong hệ thống
            userJobs = await _db.Jobs.AsNoTracking()
                .Where(j => j.OwnerId == userId)
                .OrderByDescending(j => j.CreatedAt)
                .Take(5)
                .ToListAsync(ct);

            // Seeker: Đọc danh sách các Tasker từ bảng Users (ưu tiên theo đánh giá và thời gian tạo)
            taskers = await _db.Users.AsNoTracking()
                .Where(u => u.CurrentRole == "tasker" || u.Skills != null || u.Bio != null)
                .OrderByDescending(u => u.RatingAvg)
                .ThenByDescending(u => u.CreatedAt)
                .Take(50)
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
            lower.Contains("tasker") ||
            lower.Contains("tìm thợ") ||
            lower.Contains("gợi ý thợ") ||
            lower.Contains("thợ gần") ||
            lower.Contains("tìm người làm") ||
            lower.Contains("người làm gần") ||
            lower.Contains("ai làm được") ||
            lower.Contains("ai nhận việc") ||
            lower.Contains("thợ giỏi") ||
            lower.Contains("người nhận việc") ||
            lower.Contains("gần đây") ||
            lower.Contains("quanh đây"));

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
                // Nếu Seeker có ý định đăng hoặc tạo việc -> để Gemini trực tiếp phân tích và sinh bài đăng!
                if (isSeeker && isJobDraftIntent)
                {
                    var geminiDraft = await DraftJobWithGeminiAsync(message, ct);
                    if (geminiDraft != null)
                    {
                        return geminiDraft;
                    }
                }

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
            userJobs, openJobs, taskers, currentUser);
    }

    private async Task<AiChatResponse?> DraftJobWithGeminiAsync(string userPrompt, CancellationToken ct)
    {
        var prompt = $@"
Bạn là Trợ lý AI GiGood chuyên hỗ trợ Seeker phân tích và tạo bài đăng việc vi mô (micro-gig).
Người dùng yêu cầu: ""{userPrompt}""

NHIỆM VỤ CỦA BẠN (RẤT QUAN TRỌNG):
1. Đọc và phân tích kỹ yêu cầu của người dùng để xác định đúng ngôn ngữ lập trình, môn học, kỹ năng hoặc nội dung công việc (ví dụ: người dùng nói 'Java' thì tiêu đề và mô tả PHẢI là Java, nói 'Python' thì PHẢI là Python, nói 'C#' thì mới là C#). Tuyệt đối không nhầm lẫn ngôn ngữ!
2. Sinh một bài đăng việc hoàn chỉnh, tự nhiên và thực tế:
   - title: Tiêu đề rõ ràng, nêu bật ngôn ngữ/nội dung (30-60 ký tự)
   - category: 'repair', 'cleaning', 'delivery', hoặc 'helper' (việc lập trình/code/gia sư chọn 'helper')
   - description: Viết thật chi tiết, nêu rõ nội dung bài tập/công việc, yêu cầu kiến thức (ví dụ OOP, clean code), giải thích logic và hướng dẫn chạy chương trình
   - estimatedPrice: Mức giá thù lao gợi ý phù hợp (số nguyên VNĐ, ví dụ 100000)
   - isUrgent: boolean (true nếu việc cần gấp)
   - locationText: Nếu trong yêu cầu có nhắc đến địa chỉ/địa điểm (ví dụ: '289, Nguyễn Hồng Ánh, Hoà Xuân' hoặc 'KTX Khu B', 'Quận 1'...), hãy trích xuất và tự động điền địa chỉ hoàn thiện (bổ sung quận/huyện, thành phố còn thiếu; ví dụ: '289, Nguyễn Hồng Ánh, Hoà Xuân' -> '289 Nguyễn Hồng Ánh, Hoà Xuân, Đà Nẵng'). Nếu không có địa chỉ cụ thể thì trả về null hoặc chuỗi rỗng.
   - reply: Lời giải thích ngắn gọn, thân thiện bằng tiếng Việt gửi tới người dùng.

YÊU CẦU OUTPUT:
Trả về duy nhất JSON thuần (KHÔNG dùng markdown ```json, KHÔNG có văn bản nào ngoài JSON):
{{
  ""reply"": ""Tôi đã phân tích yêu cầu của bạn và tạo bản thảo bài đăng tuyển người hỗ trợ..."",
  ""title"": ""..."",
  ""category"": ""helper"",
  ""description"": ""..."",
  ""estimatedPrice"": 100000,
  ""isUrgent"": false,
  ""locationText"": ""289 Nguyễn Hồng Ánh, Hoà Xuân, Đà Nẵng""
}}";

        var raw = await _gemini.GenerateTextAsync(prompt, temperature: 0.2, maxTokens: 1024, ct: ct);
        var res = ExtractJson<GeminiDraftRaw>(raw);
        if (res != null && !string.IsNullOrWhiteSpace(res.Title))
        {
            var cat = res.Category?.ToLowerInvariant().Trim() ?? "helper";
            if (!JobCategories.All.Contains(cat)) cat = "helper";

            var draft = new JobDraftDto(
                Title: res.Title,
                Category: cat,
                Description: res.Description ?? userPrompt,
                EstimatedPrice: res.EstimatedPrice > 0 ? res.EstimatedPrice : 100000,
                IsUrgent: res.IsUrgent,
                LocationText: !string.IsNullOrWhiteSpace(res.LocationText) ? res.LocationText.Trim() : null);

            var reply = !string.IsNullOrWhiteSpace(res.Reply)
                ? res.Reply
                : $"Tôi đã phân tích yêu cầu của bạn bằng Gemini AI và tạo bản thảo bài đăng **'{draft.Title}'**! Bạn hãy bấm 'Áp dụng vào Đăng việc ngay' bên dưới để điền form nhé.";

            return new AiChatResponse(
                Reply: reply,
                JobDraft: draft,
                IsConfigured: true);
        }

        return null;
    }

    private sealed record GeminiDraftRaw(
        string? Reply,
        string? Title,
        string? Category,
        string? Description,
        decimal EstimatedPrice,
        bool IsUrgent,
        string? LocationText = null);

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
            var taskersList = string.Join("\n", taskers.Select(t => $"• [TaskerId: {t.Id}] Tên: '{t.Name}' - Đánh giá: {t.RatingAvg:F1}★ - Khu vực/Địa chỉ: '{t.Location ?? "N/A"}' - Kỹ năng: {t.Skills ?? "[]"} - Giới thiệu: '{t.Bio ?? "N/A"}' - Phương tiện: '{t.Vehicle ?? "N/A"}'"));
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
2. NẾU SEEKER MUỐN ĐĂNG VIỆC (ví dụ: 'Tạo việc code Java', 'Code bài tập Python', 'Dọn phòng trọ', 'Giao đồ'...):
   - BẮT BUỘC bạn phải tạo `jobDraft` CHÍNH XÁC theo ngôn ngữ lập trình hoặc chủ đề người dùng yêu cầu:
     + Nếu người dùng yêu cầu 'Java' thì tiêu đề và mô tả PHẢI là Java, nếu yêu cầu 'Python' thì PHẢI là Python, TUYỆT ĐỐI KHÔNG tự ý đổi sang ngôn ngữ khác như C#!
     + title: Tiêu đề rõ ràng theo đúng ngôn ngữ/chủ đề người dùng yêu cầu
     + category: 'repair' | 'cleaning' | 'delivery' | 'helper' (việc lập trình/code/gia sư chọn 'helper')
     + description: Mô tả chi tiết các yêu cầu, công cụ, hướng dẫn
     + estimatedPrice: Giá đề xuất hợp lý bằng số nguyên (VNĐ)
     + isUrgent: boolean
     + locationText: Nếu trong yêu cầu có địa chỉ/địa điểm (ví dụ '289, Nguyễn Hồng Ánh, Hoà Xuân'...), hãy trích xuất và bổ sung quận/huyện, thành phố còn thiếu (ví dụ '289 Nguyễn Hồng Ánh, Hoà Xuân, Đà Nẵng')
3. NẾU TASKER TÌM VIỆC THEO TỪ KHÓA / NGÔN NGỮ TỰ NHIÊN:
   - Dựa vào danh sách công việc ĐANG MỞ trong Database ở trên, chọn ra các công việc phù hợp với từ khóa và điền vào `jobRecommendations` (kèm đúng `id` trong DB và `matchReason`).
4. NẾU SEEKER TÌM TASKER (RẤT QUAN TRỌNG VỀ ĐỊA PHƯƠNG / TỈNH THÀNH PHỐ):
   - ĐẶC BIỆT CHÚ Ý VỊ TRÍ ĐỊA LÝ (Location):
     + Hãy xác định tỉnh/thành phố hoặc khu vực mà Seeker đang nhắc tới (ví dụ: 'Đà Nẵng', 'Hoà Xuân', 'Cẩm Lệ', 'Ngũ Hành Sơn', 'Hải Châu', 'TP.HCM', 'Hà Nội'...).
     + NGUYÊN TẮC KẾT NỐI ĐỊA PHƯƠNG THEO THÀNH PHỐ:
       * Trong cùng một tỉnh/thành phố (Ví dụ: Cùng ở ĐÀ NẴNG): Các quận huyện/phường như Hoà Xuân, Cẩm Lệ, Ngũ Hành Sơn, Hải Châu, Sơn Trà, Thanh Khê, Liên Chiểu... nằm liền kề nhau và khoảng cách chỉ từ 2km - 8km. Các Tasker di chuyển bằng xe máy nên nhận việc và di chuyển rất thuận tiện giữa các quận lân cận trong Đà Nẵng.
       * VÌ THẾ: BẤT KỲ TASKER NÀO CÓ ĐỊA CHỈ TẠI ĐÀ NẴNG (như Ngũ Hành Sơn, Cẩm Lệ, Hải Châu...) ĐỀU ĐỦ ĐIỀU KIỆN VÀ BẮT BUỘC ĐƯỢC GỢI Ý CHO SEEKER Ở ĐÀ NẴNG / HOÀ XUÂN!
       * Nếu Seeker ở Hoà Xuân mà Tasker ở Ngũ Hành Sơn: Đây là 2 quận giáp ranh nhau tại Đà Nẵng, BẮT BUỘC GỢI Ý Tasker này và nêu rõ trong `matchReason` là 'Hoạt động tại Ngũ Hành Sơn, Đà Nẵng, giáp ranh Hoà Xuân (~3-5km), sẵn sàng nhận việc nhanh chóng'.
       * CHỈ TỪ CHỐI khi Tasker ở TỈNH/THÀNH PHỐ HOÀN TOÀN KHÁC BIỆT (Ví dụ: Seeker ở Đà Nẵng nhưng Tasker ở TP.HCM hoặc Hà Nội cách hàng trăm km thì TUYỆT ĐỐI CẤM gợi ý).
     + Nếu trong danh sách Tasker ở trên THỰC SỰ KHÔNG CÓ ai trong cùng tỉnh/thành phố với Seeker: Trả về `taskerRecommendations: []` (danh sách rỗng). Trong `reply`, giải thích rõ: 'Hiện tại hệ thống chưa có Tasker nào đăng ký hoạt động tại khu vực [tên tỉnh/thành phố] (các Tasker hiện có đang ở tỉnh/thành phố khác). Bạn có thể đăng một bài việc mới để các bạn sinh viên xung quanh nhận việc nhé!'
     + Nếu tìm được Tasker cùng thành phố: Điền vào `taskerRecommendations` (tối đa 4 người), ưu tiên người có kỹ năng phù hợp hoặc đánh giá cao lên trước, kèm `jobId` nếu Seeker có công việc phù hợp.

ĐỊNH DẠNG TRẢ VỀ:
Trả về JSON thuần duy nhất:
{{
  ""reply"": ""Nội dung trả lời và hướng dẫn người dùng bằng tiếng Việt..."",
  ""jobDraft"": null hoặc {{ ""title"": ""..."", ""category"": ""helper"", ""description"": ""..."", ""estimatedPrice"": 100000, ""isUrgent"": false, ""locationText"": ""289 Nguyễn Hồng Ánh, Hoà Xuân, Đà Nẵng"" }},
  ""jobRecommendations"": [ {{ ""id"": ""UUID"", ""title"": ""..."", ""category"": ""..."", ""price"": 50000, ""locationText"": ""..."", ""matchReason"": ""..."" }} ],
  ""taskerRecommendations"": [ {{ ""id"": ""UUID"", ""name"": ""..."", ""avatarUrl"": null, ""ratingAvg"": 4.9, ""skills"": [""helper""], ""bio"": ""..."", ""matchReason"": ""..."", ""jobId"": ""UUID_HOẶC_NULL"" }} ]
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
        List<User> taskers,
        User? currentUser = null)
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
            var relevantJob = userJobs.FirstOrDefault(j => j.Status == JobStatus.Open) ?? userJobs.FirstOrDefault();
            var promptLower = message.ToLowerInvariant();

            // Xác định thành phố / địa phương Seeker đang tìm
            bool isDaNang = promptLower.Contains("đà nẵng") || promptLower.Contains("da nang") ||
                            promptLower.Contains("hoà xuân") || promptLower.Contains("hòa xuân") ||
                            promptLower.Contains("cẩm lệ") || promptLower.Contains("hải châu") ||
                            promptLower.Contains("ngũ hành sơn") || promptLower.Contains("sơn trà") ||
                            promptLower.Contains("thanh khê") || promptLower.Contains("liên chiểu") ||
                            promptLower.Contains("nguyễn hồng ánh") ||
                            (relevantJob?.LocationText?.ToLowerInvariant().Contains("đà nẵng") == true) ||
                            (relevantJob?.LocationText?.ToLowerInvariant().Contains("hoà xuân") == true) ||
                            (currentUser?.Location?.ToLowerInvariant().Contains("đà nẵng") == true);

            bool isHcm = promptLower.Contains("hcm") || promptLower.Contains("hồ chí minh") ||
                         promptLower.Contains("sài gòn") || promptLower.Contains("bình thạnh") ||
                         promptLower.Contains("quận 1") || promptLower.Contains("thủ đức") ||
                         (relevantJob?.LocationText?.ToLowerInvariant().Contains("tp.hcm") == true) ||
                         (currentUser?.Location?.ToLowerInvariant().Contains("hồ chí minh") == true) ||
                         (currentUser?.Location?.ToLowerInvariant().Contains("tp.hcm") == true);

            bool isHaNoi = promptLower.Contains("hà nội") || promptLower.Contains("ha noi") ||
                           promptLower.Contains("cầu giấy") || promptLower.Contains("đống đa") ||
                           (relevantJob?.LocationText?.ToLowerInvariant().Contains("hà nội") == true) ||
                           (currentUser?.Location?.ToLowerInvariant().Contains("hà nội") == true);

            IEnumerable<User> candidateTaskers = taskers;

            // Lọc nghiêm ngặt: nếu tìm ở Đà Nẵng thì CHỈ lấy Tasker ở Đà Nẵng, KHÔNG BAO GIỜ lấy Bình Thạnh, TP.HCM
            if (isDaNang)
            {
                candidateTaskers = candidateTaskers.Where(t =>
                    (!string.IsNullOrEmpty(t.Location) && (
                        t.Location.ToLowerInvariant().Contains("đà nẵng") ||
                        t.Location.ToLowerInvariant().Contains("da nang") ||
                        t.Location.ToLowerInvariant().Contains("ngũ hành sơn") ||
                        t.Location.ToLowerInvariant().Contains("cẩm lệ") ||
                        t.Location.ToLowerInvariant().Contains("hoà xuân") ||
                        t.Location.ToLowerInvariant().Contains("hòa xuân") ||
                        t.Location.ToLowerInvariant().Contains("hải châu") ||
                        t.Location.ToLowerInvariant().Contains("sơn trà") ||
                        t.Location.ToLowerInvariant().Contains("thanh khê") ||
                        t.Location.ToLowerInvariant().Contains("liên chiểu")
                    )) ||
                    (!string.IsNullOrEmpty(t.Bio) && (
                        t.Bio.ToLowerInvariant().Contains("đà nẵng") ||
                        t.Bio.ToLowerInvariant().Contains("da nang") ||
                        t.Bio.ToLowerInvariant().Contains("bách khoa đn") ||
                        t.Bio.ToLowerInvariant().Contains("kinh tế đn")
                    )));
            }
            else if (isHcm)
            {
                candidateTaskers = candidateTaskers.Where(t =>
                    (!string.IsNullOrEmpty(t.Location) && (
                        t.Location.ToLowerInvariant().Contains("tp.hcm") ||
                        t.Location.ToLowerInvariant().Contains("hồ chí minh") ||
                        t.Location.ToLowerInvariant().Contains("bình thạnh") ||
                        t.Location.ToLowerInvariant().Contains("quận 1") ||
                        t.Location.ToLowerInvariant().Contains("thủ đức")
                    )) ||
                    (!string.IsNullOrEmpty(t.Bio) && t.Bio.ToLowerInvariant().Contains("tp.hcm")));
            }
            else if (isHaNoi)
            {
                candidateTaskers = candidateTaskers.Where(t =>
                    (!string.IsNullOrEmpty(t.Location) && (
                        t.Location.ToLowerInvariant().Contains("hà nội") ||
                        t.Location.ToLowerInvariant().Contains("ha noi") ||
                        t.Location.ToLowerInvariant().Contains("cầu giấy") ||
                        t.Location.ToLowerInvariant().Contains("đống đa")
                    )) ||
                    (!string.IsNullOrEmpty(t.Bio) && t.Bio.ToLowerInvariant().Contains("hà nội")));
            }

            var matched = candidateTaskers
                .OrderByDescending(t => t.RatingAvg > 0 ? t.RatingAvg : 4.5)
                .ThenByDescending(t => t.CreatedAt)
                .Take(4)
                .Select(t => new TaskerRecommendationDto(
                    t.Id,
                    t.Name,
                    t.AvatarUrl,
                    t.RatingAvg,
                    ParseSkills(t.Skills),
                    t.Bio,
                    MatchReason: !string.IsNullOrEmpty(t.Location)
                        ? (isDaNang && t.Location.ToLowerInvariant().Contains("ngũ hành sơn") && (promptLower.Contains("hoà xuân") || promptLower.Contains("cẩm lệ") || promptLower.Contains("nguyễn hồng ánh"))
                            ? $"Hoạt động tại {t.Location}, giáp ranh Hoà Xuân (~3-5km), sẵn sàng nhận việc nhanh chóng."
                            : $"Hoạt động tại {t.Location}, đánh giá {(t.RatingAvg > 0 ? $"{t.RatingAvg:F1}★" : "uy tín")}, sẵn sàng di chuyển nhận việc.")
                        : $"Đánh giá {(t.RatingAvg > 0 ? $"{t.RatingAvg:F1}★" : "uy tín")}, kỹ năng phù hợp và có phản hồi nhanh.",
                    JobId: relevantJob?.Id))
                .ToList();

            string reply;
            if (matched.Count > 0)
            {
                var areaName = isDaNang ? "khu vực Đà Nẵng (gần Hoà Xuân / Cẩm Lệ / Ngũ Hành Sơn)" : isHcm ? "khu vực TP.HCM" : "khu vực của bạn";
                reply = $"Dưới đây là các Tasker uy tín tại {areaName} phù hợp với yêu cầu của bạn:\n(Bấm 'Trò chuyện' để kết nối trao đổi trực tiếp với Tasker)";
            }
            else
            {
                var areaName = isDaNang ? "Đà Nẵng" : isHcm ? "TP.HCM" : "khu vực bạn yêu cầu";
                reply = $"Hiện tại trên hệ thống GiGood chưa có Tasker nào đăng ký hoạt động tại khu vực **{areaName}** (các Tasker hiện có đang ở tỉnh/thành phố khác). Bạn hãy đăng một bài việc mới lên hệ thống để các bạn sinh viên xung quanh nhận việc nhé!";
            }

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
        var locationText = ExtractAddressFromPrompt(userPrompt);

        // 1. Kiểm tra nếu là việc lập trình / code / CNTT / bài tập máy tính
        var isCoding = lower.Contains("code") || lower.Contains("lập trình") || lower.Contains("viết app") || lower.Contains("làm web") || lower.Contains("it") ||
                       lower.Contains("java") || lower.Contains("python") || lower.Contains("c++") || lower.Contains("cpp") || lower.Contains("c#") || lower.Contains(".net") ||
                       lower.Contains("javascript") || lower.Contains("react") || lower.Contains("html") || lower.Contains("css") || lower.Contains("sql") || lower.Contains("php") || lower.Contains("flutter");

        if (isCoding)
        {
            string language = "Lập trình";
            string topicDesc = "lập trình & giải thuật";

            if (lower.Contains("java"))
            {
                language = "Java";
                topicDesc = "lập trình hướng đối tượng (OOP) Java";
            }
            else if (lower.Contains("python"))
            {
                language = "Python";
                topicDesc = "ngôn ngữ Python, xử lý dữ liệu và thuật toán";
            }
            else if (lower.Contains("c++") || lower.Contains("cpp"))
            {
                language = "C++";
                topicDesc = "ngôn ngữ C++, cấu trúc dữ liệu & giải thuật";
            }
            else if (lower.Contains("c#") || lower.Contains(".net") || lower.Contains("csharp"))
            {
                language = "C# / .NET";
                topicDesc = "ngôn ngữ C#, .NET và lập trình hướng đối tượng (OOP)";
            }
            else if (lower.Contains("javascript") || lower.Contains("js") || lower.Contains("react") || lower.Contains("node"))
            {
                language = "JavaScript / React";
                topicDesc = "JavaScript, React và lập trình Web";
            }
            else if (lower.Contains("html") || lower.Contains("css"))
            {
                language = "HTML / CSS";
                topicDesc = "thiết kế giao diện web với HTML/CSS responsive";
            }
            else if (lower.Contains("sql") || lower.Contains("database") || lower.Contains("cơ sở dữ liệu"))
            {
                language = "SQL / Database";
                topicDesc = "truy vấn SQL và thiết kế cơ sở dữ liệu";
            }
            else if (lower.Contains("php"))
            {
                language = "PHP";
                topicDesc = "ngôn ngữ PHP và phát triển web backend";
            }
            else if (lower.Contains("flutter") || lower.Contains("dart"))
            {
                language = "Flutter";
                topicDesc = "phát triển ứng dụng di động Flutter";
            }

            return new JobDraftDto(
                Title: $"Hỗ trợ giải & code bài tập {language}",
                Category: "helper",
                Description: $"Cần bạn sinh viên hoặc lập trình viên am hiểu {topicDesc} hỗ trợ giải và viết code bài tập lớn. Yêu cầu viết code sạch, chú thích logic rõ ràng, kiểm tra chạy không lỗi và hướng dẫn cách chạy chương trình.",
                EstimatedPrice: 100000,
                IsUrgent: false,
                LocationText: locationText);
        }

        // 2. Gia sư / Kèm học các môn khác
        if (lower.Contains("tiếng anh") || lower.Contains("english") || lower.Contains("ielts") || lower.Contains("toeic"))
        {
            return new JobDraftDto(
                Title: "Gia sư Tiếng Anh kèm ôn tập / giao tiếp",
                Category: "helper",
                Description: "Cần bạn sinh viên có phát âm chuẩn hoặc chứng chỉ hỗ trợ kèm tiếng Anh 1-1 theo buổi, sửa lỗi phát âm và hướng dẫn làm bài tập.",
                EstimatedPrice: 120000,
                IsUrgent: false,
                LocationText: locationText);
        }

        if (lower.Contains("toán") || lower.Contains("lý") || lower.Contains("hóa") || lower.Contains("gia sư"))
        {
            return new JobDraftDto(
                Title: "Gia sư kèm học bài tập theo buổi",
                Category: "helper",
                Description: "Cần bạn sinh viên có kiến thức vững hỗ trợ giải đáp bài tập và ôn tập kiến thức, thái độ nhiệt tình, kiên nhẫn giảng giải.",
                EstimatedPrice: 100000,
                IsUrgent: false,
                LocationText: locationText);
        }

        if (lower.Contains("excel") || lower.Contains("word") || lower.Contains("slide") || lower.Contains("powerpoint") || lower.Contains("nhập liệu"))
        {
            return new JobDraftDto(
                Title: "Hỗ trợ làm slide PowerPoint / Nhập liệu Excel",
                Category: "helper",
                Description: "Cần một bạn thành thạo tin học văn phòng hỗ trợ thiết kế slide thuyết trình hoặc xử lý bảng tính dữ liệu nhanh chóng và đẹp mắt.",
                EstimatedPrice: 80000,
                IsUrgent: false,
                LocationText: locationText);
        }

        // 3. Dọn dẹp phòng trọ / KTX
        if (lower.Contains("dọn") || lower.Contains("vệ sinh") || lower.Contains("phòng trọ") || lower.Contains("nhà") || lower.Contains("rác") || lower.Contains("lau"))
        {
            return new JobDraftDto(
                Title: "Dọn dẹp phòng trọ / KTX cuối tuần",
                Category: "cleaning",
                Description: "Cần 1 bạn sinh viên phụ quét dọn phòng, lau sàn, cọ rửa bồn rửa/toilet và gom rác sạch sẽ trước khi trả phòng. Thời gian làm khoảng 1.5 - 2 tiếng, đồ dùng vệ sinh có sẵn tại phòng.",
                EstimatedPrice: 120000,
                IsUrgent: false,
                LocationText: locationText);
        }

        // 4. Giao hàng / Giao tài liệu / Mua hộ
        if (lower.Contains("giao") || lower.Contains("ship") || lower.Contains("tài liệu") || lower.Contains("đồ án") || lower.Contains("cơm") || lower.Contains("mua"))
        {
            return new JobDraftDto(
                Title: "Giao tài liệu & đồ án sinh viên gấp",
                Category: "delivery",
                Description: "Cần bạn có xe máy giao nhanh túi tài liệu và đồ án từ trường sang KTX / nhà trọ (~3km). Yêu cầu giao cẩn thận, không làm gập rách hay dính ướt giấy tờ.",
                EstimatedPrice: 50000,
                IsUrgent: true,
                LocationText: locationText);
        }

        // 5. Máy tính / Laptop / Cài Win / Phần mềm
        if (lower.Contains("laptop") || lower.Contains("máy tính") || lower.Contains("win") || lower.Contains("office") || lower.Contains("quạt") || lower.Contains("sửa"))
        {
            return new JobDraftDto(
                Title: "Vệ sinh laptop & cài phần mềm máy tính",
                Category: "repair",
                Description: "Laptop bị nóng quạt và chạy chậm, cần bạn sinh viên am hiểu kỹ thuật máy tính hỗ trợ thổi bụi tản nhiệt, tra keo tản nhiệt và cài đặt lại bộ ứng dụng văn phòng cơ bản.",
                EstimatedPrice: 100000,
                IsUrgent: false,
                LocationText: locationText);
        }

        // 6. Chuyển trọ / Bê đồ / Phụ việc shop
        if (lower.Contains("chuyển") || lower.Contains("bê") || lower.Contains("vác") || lower.Contains("đồ"))
        {
            return new JobDraftDto(
                Title: "Phụ dọn & chuyển đồ phòng trọ",
                Category: "helper",
                Description: "Cần 1 bạn sinh viên phụ bê vác đồ đạc nhẹ (vali quần áo, sách vở, quạt máy) chuyển sang phòng trọ mới gần trường. Quãng đường chuyển ngắn, thời gian làm khoảng 1.5 tiếng.",
                EstimatedPrice: 120000,
                IsUrgent: false,
                LocationText: locationText);
        }

        // Mặc định cho mọi yêu cầu khác: tự động lấy chủ đề thực tế từ text người dùng
        var cleanTopic = CleanUserPrompt(userPrompt);
        return new JobDraftDto(
            Title: $"Cần hỗ trợ: {cleanTopic}",
            Category: "helper",
            Description: $"Yêu cầu công việc: {userPrompt}.\nCần bạn sinh viên nhận việc hỗ trợ hoàn thành cẩn thận, đúng giờ và nhiệt tình.",
            EstimatedPrice: 80000,
            IsUrgent: false,
            LocationText: locationText);
    }

    private static string CleanUserPrompt(string text)
    {
        var cleaned = text.Trim();
        var prefixes = new[] { "tạo việc", "đăng việc", "cần tìm", "nhờ người", "cần người", "tìm người", "viết bài", "giúp tôi", "mình cần", "hỗ trợ" };
        foreach (var p in prefixes)
        {
            if (cleaned.StartsWith(p, StringComparison.OrdinalIgnoreCase))
            {
                cleaned = cleaned[p.Length..].Trim();
            }
        }
        if (string.IsNullOrWhiteSpace(cleaned)) cleaned = text.Trim();
        if (cleaned.Length > 45) cleaned = cleaned[..45] + "...";
        return char.ToUpper(cleaned[0]) + cleaned[1..];
    }

    private static string? ExtractAddressFromPrompt(string userPrompt)
    {
        if (string.IsNullOrWhiteSpace(userPrompt)) return null;
        var lower = userPrompt.ToLowerInvariant();

        // 1. Kiểm tra các địa danh quen thuộc (ví dụ Nguyễn Hồng Ánh, Hoà Xuân...)
        if (lower.Contains("nguyễn hồng ánh") || lower.Contains("hoà xuân") || lower.Contains("hòa xuân"))
        {
            if (lower.Contains("289"))
                return "289 Nguyễn Hồng Ánh, Hoà Xuân, Đà Nẵng";
            return "Đường Nguyễn Hồng Ánh, Hoà Xuân, Đà Nẵng";
        }

        // 2. Tìm kiếm sau các giới từ chỉ địa điểm: tại, ở, địa chỉ, đến, tới...
        var match = System.Text.RegularExpressions.Regex.Match(
            userPrompt,
            @"(?:tại|ở|địa chỉ|tới|đến)\s+([0-9a-zA-ZÀ-ỹ\s,\-\.\/]+)",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        if (match.Success)
        {
            var raw = match.Groups[1].Value.Trim().TrimEnd('.', ',');
            if (raw.Length >= 5 && raw.Length <= 100)
            {
                if ((raw.ToLowerInvariant().Contains("hoà xuân") || raw.ToLowerInvariant().Contains("hòa xuân"))
                    && !raw.ToLowerInvariant().Contains("đà nẵng"))
                {
                    raw += ", Đà Nẵng";
                }
                return raw;
            }
        }

        return null;
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
