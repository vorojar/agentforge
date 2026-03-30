# Common Error Patterns

| Error | Likely Cause | Quick Fix |
|-------|-------------|-----------|
| ECONNREFUSED | Service not running or wrong port | Check if service is up: `netstat -tlnp | grep PORT` |
| EADDRINUSE | Port already in use | Find process: `lsof -i :PORT` then kill it |
| ENOMEM | Out of memory | Check with `free -h`, increase swap or reduce load |
| ENOSPC | Disk full | Check with `df -h`, clean up logs or temp files |
| ETIMEDOUT | Network timeout | Check DNS, firewall, target host reachability |
| 403 Forbidden | Permission denied | Check file permissions, API key, CORS config |
| 502 Bad Gateway | Upstream service down | Check backend service health, logs |
| OOMKilled | Container out of memory | Increase container memory limit |
