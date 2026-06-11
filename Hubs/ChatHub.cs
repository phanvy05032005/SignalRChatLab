using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using SignalRChatLab.Models;

namespace SignalRChatLab.Hubs;

public class ChatHub : Hub
{
    private static readonly ConcurrentDictionary<string, OnlineUser> OnlineUsers = new();

    public override async Task OnConnectedAsync()
    {
        var shortConnectionId = Context.ConnectionId[..Math.Min(6, Context.ConnectionId.Length)];
        var guestName = $"Guest-{shortConnectionId}";

        OnlineUsers[Context.ConnectionId] = new OnlineUser
        {
            ConnectionId = Context.ConnectionId,
            UserName = guestName,
            ConnectedAt = DateTime.Now
        };

        await BroadcastOnlineUsersAsync();
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        OnlineUsers.TryRemove(Context.ConnectionId, out var user);

        if (user is not null)
        {
            await Clients.All.SendAsync("ReceiveSystemMessage", $"{user.UserName} left the chat.");
        }

        await BroadcastOnlineUsersAsync();
        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinChat(string userName)
    {
        userName = NormalizeUserName(userName);

        // Remove any existing connection for the same username to prevent duplicates on reconnect
        var existingConnections = OnlineUsers.Where(kvp => kvp.Value.UserName.Equals(userName, StringComparison.OrdinalIgnoreCase) && kvp.Key != Context.ConnectionId).ToList();
        foreach (var conn in existingConnections)
        {
            OnlineUsers.TryRemove(conn.Key, out _);
        }

        OnlineUsers[Context.ConnectionId] = new OnlineUser
        {
            ConnectionId = Context.ConnectionId,
            UserName = userName,
            ConnectedAt = DateTime.Now
        };

        await Clients.All.SendAsync("ReceiveSystemMessage", $"{userName} joined the chat.");
        await BroadcastOnlineUsersAsync();
    }

    public async Task SendTypingState(bool isTyping)
    {
        var userName = GetCurrentUserName();
        await Clients.Others.SendAsync("ReceiveTypingState", userName, isTyping);
    }

    public async Task SendMessage(string message)
    {
        message = message.Trim();

        if (string.IsNullOrWhiteSpace(message))
        {
            return;
        }

        var userName = GetCurrentUserName();
        var sentAt = DateTime.Now.ToString("HH:mm:ss");
        var messageId = Guid.NewGuid().ToString("N");

        await Clients.All.SendAsync("ReceiveMessage", messageId, userName, message, sentAt);
    }

    private string GetCurrentUserName()
    {
        return OnlineUsers.TryGetValue(Context.ConnectionId, out var user)
            ? user.UserName
            : "Unknown";
    }

    private static string NormalizeUserName(string userName)
    {
        userName = userName.Trim();
        return string.IsNullOrWhiteSpace(userName) ? "Guest" : userName;
    }

    private static Task BroadcastOnlineUsersAsync(IHubCallerClients clients)
    {
        var users = OnlineUsers.Values
            .OrderBy(user => user.UserName)
            .Select(user => new
            {
                user.ConnectionId,
                user.UserName,
                ConnectedAt = user.ConnectedAt.ToString("HH:mm:ss")
            })
            .ToList();

        return clients.All.SendAsync("ReceiveOnlineUsers", users);
    }

    private Task BroadcastOnlineUsersAsync()
    {
        return BroadcastOnlineUsersAsync(Clients);
    }
}
