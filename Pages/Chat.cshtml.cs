using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.SignalR;
using SignalRChatLab.Hubs;

namespace SignalRChatLab.Pages;

[DisableRequestSizeLimit]
[RequestFormLimits(MultipartBodyLengthLimit = 2147483648)] // 2 GB limit
public class ChatModel : PageModel
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".webp"
    };

    private static readonly HashSet<string> FileExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".docx", ".txt", ".zip"
    };

    private readonly IWebHostEnvironment _environment;
    private readonly IHubContext<ChatHub> _hubContext;

    public ChatModel(IWebHostEnvironment environment, IHubContext<ChatHub> hubContext)
    {
        _environment = environment;
        _hubContext = hubContext;
    }

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostUploadAsync(IFormFile? uploadFile, string? userName)
    {
        if (uploadFile is null || uploadFile.Length == 0)
        {
            return new JsonResult(new { success = false, message = "Please choose a file." });
        }

        var originalFileName = Path.GetFileName(uploadFile.FileName);
        var extension = Path.GetExtension(originalFileName);
        var isImage = ImageExtensions.Contains(extension);
        var isAllowedFile = FileExtensions.Contains(extension);

        if (!isImage && !isAllowedFile)
        {
            return new JsonResult(new { success = false, message = "Only image, PDF, DOCX, TXT and ZIP files are allowed." });
        }

        var relativeFolder = isImage
            ? Path.Combine("uploads", "images")
            : "files";

        var uploadFolder = Path.Combine(_environment.WebRootPath, relativeFolder);
        Directory.CreateDirectory(uploadFolder);

        var storedFileName = $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var storedPath = Path.Combine(uploadFolder, storedFileName);

        await using (var stream = System.IO.File.Create(storedPath))
        {
            await uploadFile.CopyToAsync(stream);
        }

        var fileUrl = "/" + relativeFolder.Replace(Path.DirectorySeparatorChar, '/') + "/" + storedFileName;
        var displayName = string.IsNullOrWhiteSpace(userName) ? "Guest" : userName.Trim();
        var uploadedAt = DateTime.Now.ToString("HH:mm:ss");
        var uploadId = Guid.NewGuid().ToString("N");

        if (isImage)
        {
            await _hubContext.Clients.All.SendAsync("ReceiveImage", uploadId, displayName, originalFileName, fileUrl, uploadedAt);
        }
        else
        {
            await _hubContext.Clients.All.SendAsync("ReceiveFile", uploadId, displayName, originalFileName, fileUrl, uploadedAt);
        }

        return new JsonResult(new
        {
            success = true,
            uploadId,
            isImage,
            fileName = originalFileName,
            fileUrl
        });
    }
}
