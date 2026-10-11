param([int]$Port = 8088)

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "DistriCare CRM server started at http://localhost:$Port/"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        try {
            $relPath = $request.Url.LocalPath
            if ($relPath -eq '/' -or [string]::IsNullOrWhiteSpace($relPath)) {
                $relPath = '/index.html'
            }
            
            $filePath = Join-Path $root ($relPath.TrimStart('/').Replace('/', '\'))
            
            if (Test-Path $filePath -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                
                if ($filePath.EndsWith('.html')) { $response.ContentType = 'text/html; charset=utf-8' }
                elseif ($filePath.EndsWith('.js')) { $response.ContentType = 'application/javascript; charset=utf-8' }
                elseif ($filePath.EndsWith('.css')) { $response.ContentType = 'text/css; charset=utf-8' }
                elseif ($filePath.EndsWith('.json')) { $response.ContentType = 'application/json; charset=utf-8' }
                elseif ($filePath.EndsWith('.png')) { $response.ContentType = 'image/png' }
                elseif ($filePath.EndsWith('.jpg') -or $filePath.EndsWith('.jpeg')) { $response.ContentType = 'image/jpeg' }
                elseif ($filePath.EndsWith('.svg')) { $response.ContentType = 'image/svg+xml' }
                else { $response.ContentType = 'application/octet-stream' }
                
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $relPath")
                $response.OutputStream.Write($msg, 0, $msg.Length)
            }
        } catch {
            Write-Warning "Error processing request: $_"
        } finally {
            try { $response.Close() } catch {}
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
