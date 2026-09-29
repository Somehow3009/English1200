$root = Join-Path $PSScriptRoot "public"  # preview nhanh frontend (không có API: app tự dùng dữ liệu local)
$mime = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8";
  ".js"="application/javascript; charset=utf-8"; ".json"="application/json; charset=utf-8";
  ".png"="image/png"; ".ico"="image/x-icon" }
$lis = New-Object System.Net.HttpListener
$lis.Prefixes.Add("http://localhost:8080/")
$lis.Start()
Write-Host "Serving $root at http://localhost:8080/ (Ctrl+C to stop)"
while ($lis.IsListening) {
  $ctx = $lis.GetContext()
  $p = $ctx.Request.Url.LocalPath.TrimStart("/")
  if ($p -eq "") { $p = "index.html" }
  $f = Join-Path $root $p
  if ((Test-Path $f -PathType Leaf)) {
    $ext = [IO.Path]::GetExtension($f).ToLower()
    $ctx.Response.ContentType = $mime[$ext]
    if (-not $ctx.Response.ContentType) { $ctx.Response.ContentType = "application/octet-stream" }
    $b = [IO.File]::ReadAllBytes($f)
    $ctx.Response.ContentLength64 = $b.Length
    $ctx.Response.OutputStream.Write($b, 0, $b.Length)
  } else { $ctx.Response.StatusCode = 404 }
  $ctx.Response.Close()
}
