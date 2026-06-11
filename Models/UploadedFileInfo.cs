namespace SignalRChatLab.Models;

public class UploadedFileInfo
{
    public string UserName { get; set; } = string.Empty;

    public string OriginalFileName { get; set; } = string.Empty;

    public string StoredFileName { get; set; } = string.Empty;

    public string FileUrl { get; set; } = string.Empty;

    public bool IsImage { get; set; }

    public DateTime UploadedAt { get; set; } = DateTime.Now;
}
