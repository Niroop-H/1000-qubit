<#
Construct an UNSIGNED Microsoft Store MSIX candidate using the Windows SDK.
Inputs MUST match the exact product Identity Name and Publisher in Partner Center.
This does NOT enroll, sign, test-install or certify the application.
#>
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9.]{2,49}$')][string]$IdentityName,
 [Parameter(Mandatory=$true)][ValidatePattern('^(CN|O|OU)=.+')][string]$Publisher,
 [Parameter(Mandatory=$true)][ValidatePattern('^\d+\.\d+\.\d+\.\d+$')][string]$Version,
 [string]$PublisherDisplayName="MAH Quantum",
 [string]$OutputPath="artifacts/store/D25-Quantum-Workspace-UNSIGNED.msix"
)
$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest
$root=Split-Path -Parent $PSScriptRoot
$binary=Join-Path $root "src-tauri/target/release/d25-quantum-workspace.exe"
$icon=Join-Path $root "src-tauri/icons/128x128.png"
if(!(Test-Path $binary)){throw "Run npm run desktop:build before MSIX packaging."}
if(!(Test-Path $icon)){throw "Run npm run desktop:icons before MSIX packaging."}
$stage=Join-Path $root "artifacts/store/msix-staging"
if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
New-Item (Join-Path $stage "Assets") -ItemType Directory -Force | Out-Null
Copy-Item $binary (Join-Path $stage "d25-quantum-workspace.exe")
Add-Type -AssemblyName System.Drawing
$source=[System.Drawing.Image]::FromFile($icon)
try{
 foreach($size in @(44,50,150)){
  $dest=if($size -eq 44){"Square44x44Logo.png"}elseif($size -eq 50){"StoreLogo.png"}else{"Square150x150Logo.png"}
  $bmp=[System.Drawing.Bitmap]::new($size,$size)
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  try{
   $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
   $g.DrawImage($source,0,0,$size,$size)
   $bmp.Save((Join-Path $stage "Assets/$dest"),[System.Drawing.Imaging.ImageFormat]::Png)
  }finally{$g.Dispose();$bmp.Dispose()}
 }
}finally{$source.Dispose()}
$name=[System.Security.SecurityElement]::Escape($IdentityName)
$publisherValue=[System.Security.SecurityElement]::Escape($Publisher)
$versionValue=[System.Security.SecurityElement]::Escape($Version)
$publisherDisplay=[System.Security.SecurityElement]::Escape($PublisherDisplayName)
$manifest=@"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap uap10 rescap">
 <Identity Name="$name" Publisher="$publisherValue" Version="$versionValue" ProcessorArchitecture="x64"/>
 <Properties>
  <DisplayName>D25 Quantum Workspace</DisplayName>
  <PublisherDisplayName>$publisherDisplay</PublisherDisplayName>
  <Description>D25 Quantum Workspace by Devashri S Industries, a division of MAH Quantum</Description>
  <Logo>Assets\StoreLogo.png</Logo>
 </Properties>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0"/></Dependencies>
 <Resources><Resource Language="en-US"/></Resources>
 <Applications>
  <Application Id="D25QuantumWorkspace" Executable="d25-quantum-workspace.exe"
   EntryPoint="Windows.FullTrustApplication"
   uap10:RuntimeBehavior="packagedClassicApp" uap10:TrustLevel="mediumIL">
   <uap:VisualElements DisplayName="D25 Quantum Workspace"
    Description="D25 Quantum Workspace by Devashri S Industries"
    BackgroundColor="transparent"
    Square150x150Logo="Assets\Square150x150Logo.png"
    Square44x44Logo="Assets\Square44x44Logo.png"/>
  </Application>
 </Applications>
 <Capabilities><rescap:Capability Name="runFullTrust"/></Capabilities>
</Package>
"@
[System.IO.File]::WriteAllText((Join-Path $stage "AppxManifest.xml"),$manifest,([System.Text.UTF8Encoding]::new($false)))
[xml]$parsed=Get-Content (Join-Path $stage "AppxManifest.xml")
if($parsed.Package.Identity.Name -ne $IdentityName -or $parsed.Package.Identity.Publisher -ne $Publisher){throw "Invalid manifest publisher or identity."}
$sdkRoot=Join-Path ([Environment]::GetFolderPath("ProgramFilesX86")) "Windows Kits/10/bin"
if(!(Test-Path $sdkRoot)){throw "Install Windows SDK (Visual Studio Build Tools)."}
$packer=Get-ChildItem $sdkRoot -Directory |
 Sort-Object Name -Descending |
 ForEach-Object {Join-Path $_.FullName "x64/MakeAppx.exe"} |
 Where-Object {Test-Path $_} |
 Select-Object -First 1
if(!$packer){throw "Missing MakeAppx.exe in the Windows SDK."}
$out=if([System.IO.Path]::IsPathRooted($OutputPath)){$OutputPath}else{Join-Path $root $OutputPath}
$out=[System.IO.Path]::GetFullPath($out)
New-Item (Split-Path -Parent $out) -ItemType Directory -Force | Out-Null
if(Test-Path $out){Remove-Item $out -Force}
& $packer pack /d $stage /p $out /o
if($LASTEXITCODE -ne 0 -or !(Test-Path $out)){throw "MakeAppx packaging failed."}
$hash=Get-FileHash $out -Algorithm SHA256
Write-Host "Created UNSIGNED MSIX at $out"
Write-Host "SHA-256: $($hash.Hash)"
Write-Host "NOT CERTIFIED. Do not publish without Partner Center and release acceptance."
