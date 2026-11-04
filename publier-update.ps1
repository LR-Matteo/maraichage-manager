$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Windows PowerShell 5.1 n'active pas TLS 1.2 par defaut sur certaines
# configurations, alors que l'API GitHub l'exige : sans cette ligne,
# Invoke-RestMethod echoue avec "Impossible d'etablir une relation de
# confiance pour le canal securise SSL/TLS" (Node/electron-builder n'est pas
# concerne, il active TLS 1.2+ automatiquement).
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

Write-Host ""
Write-Host " ================================================"
Write-Host "  Maraichage Manager - Publication d'une mise a jour"
Write-Host " ================================================"
Write-Host ""

# --- Lire la config depuis package.json ---
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$version = $pkg.version
$owner = $pkg.build.publish.owner
$repo = $pkg.build.publish.repo
$tag = "v$version"

Write-Host " Version a publier : $version (tag $tag)"
Write-Host " Depot GitHub       : $owner/$repo"
Write-Host ""

# --- Charger le token depuis .env ---
if (-not (Test-Path ".env")) {
    Write-Host " ERREUR : fichier .env introuvable (GH_TOKEN requis)."
    exit 1
}
$tokenLine = Get-Content ".env" | Select-String "GH_TOKEN="
if (-not $tokenLine) {
    Write-Host " ERREUR : GH_TOKEN absent du fichier .env."
    exit 1
}
$env:GH_TOKEN = $tokenLine.ToString().Split('=', 2)[1].Trim('"')
$authHeaders = @{ Authorization = "token $($env:GH_TOKEN)"; 'User-Agent' = 'maraichage-app-publish-script' }

# --- Verifier que cette version n'a pas deja ete publiee ---
try {
    $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/tags/$tag" -Headers $authHeaders -TimeoutSec 15
} catch {
    $existing = $null
}
if ($existing) {
    Write-Host " ERREUR : la version $version existe deja sur GitHub (tag $tag)."
    Write-Host " Incrementez la version dans package.json avant de publier une nouvelle mise a jour."
    exit 1
}

# --- Contourner une eventuelle inspection HTTPS locale (antivirus) qui bloque Node ---
try {
    $rootCerts = Get-ChildItem Cert:\LocalMachine\Root -ErrorAction Stop |
        Where-Object { $_.Subject -match "Avast|Kaspersky|ESET|Bitdefender|Norton|McAfee|Fortinet|Zscaler|AVG" }
    if ($rootCerts) {
        $certDir = Join-Path $env:TEMP "maraichage-ca"
        New-Item -ItemType Directory -Force -Path $certDir | Out-Null
        $pemPath = Join-Path $certDir "local-root-ca.pem"
        $pemContent = ($rootCerts | ForEach-Object {
            "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($_.RawData, 'InsertLineBreaks') + "`n-----END CERTIFICATE-----"
        }) -join "`n"
        Set-Content -Path $pemPath -Value $pemContent -Encoding ascii
        $env:NODE_EXTRA_CA_CERTS = $pemPath
        Write-Host " Antivirus avec inspection HTTPS detecte -> certificat local ajoute a la confiance Node."
        Write-Host ""
    }
} catch {
    Write-Host " (Verification antivirus ignoree : $($_.Exception.Message))"
}

# --- Construire et publier (release GitHub creee en brouillon par electron-builder) ---
Write-Host " Construction et publication en cours (quelques minutes)..."
Write-Host ""
npm run publish-win
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host " ERREUR lors de la construction/publication."
    exit 1
}

# --- Sortir la release du mode brouillon pour qu'elle soit visible par l'auto-updater ---
Write-Host ""
Write-Host " Publication de la release GitHub (elle est creee en brouillon par defaut)..."

$releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases" -Headers $authHeaders -TimeoutSec 20
$release = $releases | Where-Object { $_.tag_name -eq $tag } | Select-Object -First 1

if (-not $release) {
    Write-Host " ATTENTION : release $tag introuvable sur GitHub, verifiez manuellement sur github.com/$owner/$repo/releases"
    exit 1
}

if ($release.draft) {
    $body = @{ draft = $false } | ConvertTo-Json
    Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/$($release.id)" -Method Patch -Headers $authHeaders -Body $body -ContentType "application/json" -TimeoutSec 20 | Out-Null
    Write-Host " OK - Release $tag publiee (n'est plus en brouillon)."
} else {
    Write-Host " OK - Release $tag deja publique."
}

Write-Host ""
Write-Host " ================================================"
Write-Host "  Termine ! Les utilisateurs recevront la mise a jour"
Write-Host "  automatiquement au prochain lancement de l'application."
Write-Host "  $($release.html_url)"
Write-Host " ================================================"
Write-Host ""
