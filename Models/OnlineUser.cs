namespace SignalRChatLab.Models;

public class OnlineUser
{
    public string ConnectionId { get; set; } = string.Empty;

    public string UserName { get; set; } = string.Empty;

    public DateTime ConnectedAt { get; set; } = DateTime.Now;
}
