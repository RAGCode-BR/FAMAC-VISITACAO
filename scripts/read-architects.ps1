param(
  [Parameter(Mandatory=$true)][string]$Path,
  [string]$Output = 'test-results/architects-source.local'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$book = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Path))
function Read-BookXml([string]$Name) {
  $entry = $book.GetEntry($Name)
  if (!$entry) { return $null }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
}
try {
  $strings = Read-BookXml 'xl/sharedStrings.xml'
  $values = @($strings.sst.si | ForEach-Object {
    ($_.SelectNodes('.//*[local-name()="t"]') | ForEach-Object { $_.InnerText }) -join ''
  })
  $workbook = Read-BookXml 'xl/workbook.xml'
  $relations = Read-BookXml 'xl/_rels/workbook.xml.rels'
  $rows = @()
  foreach ($tab in $workbook.workbook.sheets.sheet) {
    $relationId = $tab.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $relation = $relations.Relationships.Relationship | Where-Object Id -EQ $relationId
    $target = if ($relation.Target.StartsWith('/')) { $relation.Target.TrimStart('/') } else { 'xl/' + $relation.Target }
    $sheet = Read-BookXml $target
    foreach ($row in $sheet.worksheet.sheetData.row) {
      if ([int]$row.r -le 1) { continue }
      $cells = @{}
      foreach ($cell in $row.c) {
        $column = $cell.r -replace '\d', ''
        if ($column -notin @('A','B','C','D')) { continue }
        $value = [string]$cell.v
        if ($cell.t -eq 's') { $value = $values[[int]$value] }
        elseif ($cell.t -eq 'inlineStr') { $value = ($cell.SelectNodes('.//*[local-name()="t"]') | ForEach-Object { $_.InnerText }) -join '' }
        $cells[$column] = $value.Trim()
      }
      if (!$cells['A']) { continue }
      $rows += [pscustomobject]@{
        sheet = [string]$tab.name; row = [int]$row.r
        name = $cells['A']; phone = $cells['B']; city = $cells['C']; profession = $cells['D']
      }
    }
  }
  [IO.File]::WriteAllText((Join-Path (Get-Location) $Output), (ConvertTo-Json -InputObject $rows -Depth 4), [Text.UTF8Encoding]::new($false))
  Write-Output "PASS: $($rows.Count) linhas lidas; somente nome, contato, cidade e cargo para triagem"
} finally { $book.Dispose() }
