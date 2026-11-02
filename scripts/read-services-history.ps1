param(
  [Parameter(Mandatory=$true)][string]$Path,
  [string[]]$ExcludeSheet = @(),
  [string]$Output = 'test-results/services-history-source.local.json'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$agendaSource = (Resolve-Path -LiteralPath $Path).Path
$agendaOutputRoot = [IO.Path]::GetFullPath((Join-Path (Get-Location) 'test-results'))
$agendaOutput = [IO.Path]::GetFullPath((Join-Path (Get-Location) $Output))
if (!$agendaOutput.StartsWith($agendaOutputRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'A extração deve ficar em test-results, fora do código público.' }
$agendaBook = [IO.Compression.ZipFile]::OpenRead($agendaSource)
function Read-AgendaXml([string]$Entry) {
  $agendaEntry = $agendaBook.GetEntry($Entry)
  if (!$agendaEntry) { return $null }
  $agendaReader = [IO.StreamReader]::new($agendaEntry.Open())
  try { return [xml]$agendaReader.ReadToEnd() } finally { $agendaReader.Dispose() }
}
try {
  $agendaShared = Read-AgendaXml 'xl/sharedStrings.xml'
  $agendaStrings = @($agendaShared.sst.si | ForEach-Object { ($_.SelectNodes('.//*[local-name()="t"]') | ForEach-Object { $_.InnerText }) -join '' })
  $agendaWorkbook = Read-AgendaXml 'xl/workbook.xml'
  $agendaRelations = Read-AgendaXml 'xl/_rels/workbook.xml.rels'
  $agendaStyles = Read-AgendaXml 'xl/styles.xml'
  if ($agendaStyles.SelectNodes('//*[local-name()="dxf"]/*[local-name()="fill"]').Count) { throw 'Há cores condicionais que precisam de revisão antes da extração.' }
  $agendaFormats = @($agendaStyles.styleSheet.cellXfs.xf)
  $agendaFills = @($agendaStyles.styleSheet.fills.fill)
  $agendaRecords = [Collections.Generic.List[object]]::new()
  $agendaSheets = @()
  foreach ($agendaTab in $agendaWorkbook.workbook.sheets.sheet) {
    if ($agendaTab.name -in $ExcludeSheet) { continue }
    $agendaRelationId = $agendaTab.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $agendaTarget = ($agendaRelations.Relationships.Relationship | Where-Object Id -EQ $agendaRelationId).Target
    $agendaSheetPath = if ($agendaTarget.StartsWith('/')) { $agendaTarget.TrimStart('/') } else { 'xl/' + $agendaTarget }
    $agendaSheet = Read-AgendaXml $agendaSheetPath
    $agendaDates = @{}
    $agendaBefore = $agendaRecords.Count
    foreach ($agendaRow in $agendaSheet.worksheet.sheetData.row) {
      foreach ($agendaCell in $agendaRow.c) {
        $agendaColumn = $agendaCell.r -replace '\d', ''
        if ($agendaColumn -notin @('B','C','D','E','F','G','H')) { continue }
        $agendaValue = [string]$agendaCell.v
        if ($agendaCell.t -eq 's') { $agendaValue = $agendaStrings[[int]$agendaValue] }
        elseif ($agendaCell.t -eq 'inlineStr') { $agendaValue = ($agendaCell.SelectNodes('.//*[local-name()="t"]') | ForEach-Object { $_.InnerText }) -join '' }
        if ($agendaCell.t -ne 's' -and $agendaValue -match '^46\d{3}$') {
          $agendaSerial = [double]$agendaValue
          if ($agendaWorkbook.workbook.workbookPr.date1904 -eq '1') { $agendaSerial += 1462 }
          $agendaDates[$agendaColumn] = [DateTime]::FromOADate($agendaSerial).ToString('yyyy-MM-dd')
          continue
        }
        if ([int]$agendaRow.r -le 4 -or !$agendaValue.Trim() -or $agendaValue.Trim() -match '^(Anota\u00e7\u00f5es|LEGENDA)$') { continue }
        if (!$agendaDates[$agendaColumn]) { throw "Lançamento sem data: $($agendaTab.name)!$($agendaCell.r)" }
        $agendaFormat = $agendaFormats[[int]$agendaCell.s]
        $agendaFill = $agendaFills[[int]$agendaFormat.fillId].patternFill.fgColor
        $agendaStatus = 'unknown'
        if ($agendaFill.theme -eq '9' -and [double]$agendaFill.tint -gt 0.79) { $agendaStatus = 'completed' }
        elseif ($agendaFill.theme -eq '7' -and [double]$agendaFill.tint -gt 0.79) { $agendaStatus = 'in_progress' }
        elseif ($agendaFill.theme -eq '5' -and [double]$agendaFill.tint -gt 0.59 -and [double]$agendaFill.tint -lt 0.61) { $agendaStatus = 'return_required' }
        elseif ($agendaFill.rgb -in @('FFF17FF1','FFE980EC')) { $agendaStatus = 'scheduled' }
        if ($agendaValue -match '(?i)\bCANCELADO\b') { $agendaStatus = 'cancelled' }
        $agendaRecords.Add([pscustomobject]@{
          sourceKey = "agenda-servicos-2026/$($agendaTab.name)/$($agendaCell.r)"
          sheet = [string]$agendaTab.name
          cell = [string]$agendaCell.r
          date = [string]$agendaDates[$agendaColumn]
          raw = $agendaValue.Trim()
          status = $agendaStatus
          fillId = [int]$agendaFormat.fillId
        })
      }
    }
    $agendaSheets += [pscustomobject]@{ name = [string]$agendaTab.name; entries = $agendaRecords.Count - $agendaBefore }
  }
  $agendaResult = [pscustomobject]@{
    version = 1
    sourceFile = [IO.Path]::GetFileName($agendaSource)
    sourceHash = (Get-FileHash -LiteralPath $agendaSource -Algorithm SHA256).Hash.ToLowerInvariant()
    excludedSheets = @($ExcludeSheet)
    sheets = $agendaSheets
    records = @($agendaRecords.ToArray())
  }
  [IO.Directory]::CreateDirectory($agendaOutputRoot) | Out-Null
  [IO.File]::WriteAllText($agendaOutput, ($agendaResult | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
  Write-Output "PASS: $($agendaRecords.Count) lançamentos extraídos; excluídas: $($ExcludeSheet -join ', '); arquivo privado em test-results."
  $agendaSheets | Format-Table -AutoSize
} finally { $agendaBook.Dispose() }
