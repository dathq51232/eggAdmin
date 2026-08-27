$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Set-Location $PSScriptRoot

function New-HexToken {
  param([int]$ByteCount = 16)

  $bytes = New-Object byte[] $ByteCount
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

$envPath = Join-Path $PSScriptRoot ".env"
$credentialsPath = Join-Path $PSScriptRoot "local-credentials.txt"

if (Test-Path $envPath) {
  $existingConfig = Get-Content -Raw -Path $envPath
  if ($existingConfig -match "replace-" -or $existingConfig -notmatch "DATABASE_URL") {
    throw "File .env vẫn còn giá trị mẫu. Hãy xóa .env rồi chạy lại run.bat để tạo cấu hình local mới."
  }
  Write-Host "Đang dùng cấu hình .env hiện có." -ForegroundColor Green
  exit 0
}

$databasePassword = New-HexToken -ByteCount 12
$authSecret = New-HexToken -ByteCount 32
$adminPassword = "Admin@" + (New-HexToken -ByteCount 6)
$counterPassword = "Counter@" + (New-HexToken -ByteCount 6)
$qcPassword = "QC@" + (New-HexToken -ByteCount 6)
$warehousePassword = "Warehouse@" + (New-HexToken -ByteCount 6)

$envLines = @(
  "POSTGRES_PASSWORD=`"$databasePassword`""
  "DATABASE_URL=`"postgresql://egg_admin:$databasePassword@localhost:5434/egg_admin?schema=public`""
  "AUTH_SECRET=`"$authSecret`""
  "AUTH_URL=`"http://localhost:3030`""
  ""
  "SEED_ADMIN_EMAIL=`"admin@egg.local`""
  "SEED_ADMIN_PASSWORD=`"$adminPassword`""
  "SEED_COUNTER_EMAIL=`"counter@egg.local`""
  "SEED_COUNTER_PASSWORD=`"$counterPassword`""
  "SEED_QC_EMAIL=`"qc@egg.local`""
  "SEED_QC_PASSWORD=`"$qcPassword`""
  "SEED_WAREHOUSE_EMAIL=`"warehouse@egg.local`""
  "SEED_WAREHOUSE_PASSWORD=`"$warehousePassword`""
)

$credentialLines = @(
  "EGG ADMIN - TÀI KHOẢN LOCAL"
  "========================================"
  "Quản trị       | admin@egg.local     | $adminPassword"
  "Nhân viên đếm  | counter@egg.local   | $counterPassword"
  "QC             | qc@egg.local        | $qcPassword"
  "Thủ kho        | warehouse@egg.local | $warehousePassword"
  "========================================"
  "Chỉ lưu file này trên máy nội bộ. Không gửi lên GitHub hoặc chia sẻ công khai."
)

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($envPath, $envLines, $utf8WithoutBom)
[System.IO.File]::WriteAllLines($credentialsPath, $credentialLines, $utf8WithoutBom)

Write-Host "Đã tạo cấu hình và tài khoản local an toàn." -ForegroundColor Green
Write-Host "Thông tin đăng nhập: $credentialsPath" -ForegroundColor Yellow
