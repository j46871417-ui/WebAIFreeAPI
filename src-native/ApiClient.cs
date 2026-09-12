using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace WebAIFreeAPI.Native
{
    public class ApiClient
    {
        private readonly string baseUrl;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();

        public ApiClient(string baseUrl = "http://127.0.0.1:4317")
        {
            this.baseUrl = baseUrl.TrimEnd('/');
            json.MaxJsonLength = int.MaxValue;
        }

        public bool CheckHealth()
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(baseUrl + "/health");
                req.Timeout = 1500;
                using (var res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        public async Task<bool> WaitForReadyAsync(int timeoutSec = 15, CancellationToken ct = default(CancellationToken))
        {
            var start = DateTime.UtcNow;
            while ((DateTime.UtcNow - start).TotalSeconds < timeoutSec)
            {
                if (ct.IsCancellationRequested) return false;
                if (CheckHealth()) return true;
                await Task.Delay(300, ct);
            }
            return false;
        }

        public async Task<Dictionary<string, object>> GetStateAsync()
        {
            return await GetJsonAsync<Dictionary<string, object>>("/api/state");
        }

        public async Task<Dictionary<string, object>> CreateConversationAsync(string title, string provider, string mode, string workspace, string roleId)
        {
            var body = new Dictionary<string, object>
            {
                { "title", title },
                { "provider", provider },
                { "mode", mode },
                { "workspace", workspace },
                { "roleId", roleId }
            };
            return await PostJsonAsync<Dictionary<string, object>>("/api/conversations", body);
        }

        public async Task<bool> DeleteConversationAsync(string id)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(baseUrl + "/api/conversations/" + id);
                req.Method = "DELETE";
                req.Timeout = 5000;
                using (var res = (HttpWebResponse)await req.GetResponseAsync())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        public async Task<Dictionary<string, object>> GetSettingsAsync()
        {
            return await GetJsonAsync<Dictionary<string, object>>("/api/settings");
        }

        public async Task<Dictionary<string, object>> SaveSettingsAsync(Dictionary<string, object> settings)
        {
            return await PutJsonAsync<Dictionary<string, object>>("/api/settings", settings);
        }

        public async Task<bool> OpenTerminalAsync(string workspace, string shell = "powershell")
        {
            try
            {
                var body = new Dictionary<string, object>
                {
                    { "workspace", workspace },
                    { "shell", shell }
                };
                await PostJsonAsync<Dictionary<string, object>>("/api/terminal/open", body);
                return true;
            }
            catch
            {
                return false;
            }
        }

        public async Task<bool> StopConversationAsync(string id)
        {
            try
            {
                await PostJsonAsync<Dictionary<string, object>>("/api/conversations/" + id + "/stop", new Dictionary<string, object>());
                return true;
            }
            catch
            {
                return false;
            }
        }

        public Task SendMessageStreamingAsync(
            string convId,
            string content,
            Action<string> onDelta,
            Action<Dictionary<string, object>> onComplete,
            Action<string> onError,
            CancellationToken ct = default(CancellationToken))
        {
            return Task.Run(() =>
            {
                HttpWebRequest req = null;
                HttpWebResponse res = null;
                Stream stream = null;
                StreamReader reader = null;
                try
                {
                    req = (HttpWebRequest)WebRequest.Create(baseUrl + "/api/conversations/" + convId + "/messages");
                    req.Method = "POST";
                    req.ContentType = "application/json";
                    req.Timeout = 120000;

                    var payload = new Dictionary<string, object>
                    {
                        { "content", content },
                        { "role", "user" }
                    };
                    var bytes = Encoding.UTF8.GetBytes(json.Serialize(payload));
                    req.ContentLength = bytes.Length;

                    using (var reqStream = req.GetRequestStream())
                    {
                        reqStream.Write(bytes, 0, bytes.Length);
                    }

                    res = (HttpWebResponse)req.GetResponse();
                    stream = res.GetResponseStream();
                    reader = new StreamReader(stream, Encoding.UTF8);

                    string line;
                    while ((line = reader.ReadLine()) != null)
                    {
                        if (ct.IsCancellationRequested) break;
                        line = line.Trim();
                        if (string.IsNullOrEmpty(line)) continue;

                        try
                        {
                            var evt = json.Deserialize<Dictionary<string, object>>(line);
                            if (evt == null) continue;

                            string type = evt.ContainsKey("type") && evt["type"] != null ? evt["type"].ToString() : "";
                            if (type == "delta")
                            {
                                string text = "";
                                if (evt.ContainsKey("content") && evt["content"] != null)
                                    text = evt["content"].ToString();
                                else if (evt.ContainsKey("text") && evt["text"] != null)
                                    text = evt["text"].ToString();

                                if (onDelta != null) onDelta(text);
                            }
                            else if (type == "done")
                            {
                                if (onComplete != null) onComplete(evt);
                            }
                            else if (type == "error")
                            {
                                string err = evt.ContainsKey("error") && evt["error"] != null ? evt["error"].ToString() : "Unknown error";
                                if (onError != null) onError(err);
                            }
                            else if (evt.ContainsKey("conversation"))
                            {
                                if (onComplete != null) onComplete(evt);
                            }
                        }
                        catch
                        {
                            // ignore line parse errors
                        }
                    }
                }
                catch (Exception ex)
                {
                    if (!ct.IsCancellationRequested && onError != null)
                    {
                        onError(ex.Message);
                    }
                }
                finally
                {
                    try { if (reader != null) reader.Dispose(); } catch {}
                    try { if (stream != null) stream.Dispose(); } catch {}
                    try { if (res != null) res.Dispose(); } catch {}
                }
            }, ct);
        }

        private async Task<T> GetJsonAsync<T>(string endpoint)
        {
            var req = (HttpWebRequest)WebRequest.Create(baseUrl + endpoint);
            req.Method = "GET";
            req.Timeout = 10000;
            using (var res = (HttpWebResponse)await req.GetResponseAsync())
            using (var stream = res.GetResponseStream())
            using (var reader = new StreamReader(stream, Encoding.UTF8))
            {
                var text = await reader.ReadToEndAsync();
                return json.Deserialize<T>(text);
            }
        }

        private async Task<T> PostJsonAsync<T>(string endpoint, object payload)
        {
            return await SendPayloadAsync<T>("POST", endpoint, payload);
        }

        private async Task<T> PutJsonAsync<T>(string endpoint, object payload)
        {
            return await SendPayloadAsync<T>("PUT", endpoint, payload);
        }

        private async Task<T> SendPayloadAsync<T>(string method, string endpoint, object payload)
        {
            var req = (HttpWebRequest)WebRequest.Create(baseUrl + endpoint);
            req.Method = method;
            req.ContentType = "application/json";
            req.Timeout = 15000;

            var raw = json.Serialize(payload);
            var bytes = Encoding.UTF8.GetBytes(raw);
            req.ContentLength = bytes.Length;

            using (var reqStream = await req.GetRequestStreamAsync())
            {
                await reqStream.WriteAsync(bytes, 0, bytes.Length);
            }

            using (var res = (HttpWebResponse)await req.GetResponseAsync())
            using (var stream = res.GetResponseStream())
            using (var reader = new StreamReader(stream, Encoding.UTF8))
            {
                var text = await reader.ReadToEndAsync();
                return json.Deserialize<T>(text);
            }
        }
    }
}
