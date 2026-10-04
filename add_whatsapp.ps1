$files = @("abstract.html", "appointment.html", "blood-donation.html", "hospital.html", "medicine.html")

$wa_snippet_inline = '<div class="footer-contact-item"><span class="contact-icon">💬</span><a href="https://wa.me/917379294659" target="_blank" style="color:rgba(255,255,255,0.6); text-decoration:none; transition:0.3s;" onmouseover="this.style.color=''white''" onmouseout="this.style.color=''rgba(255,255,255,0.6)''">WhatsApp Us</a></div>'
$target_inline = '<div class="footer-contact-item"><span class="contact-icon">📍</span><span>Health Innovation Hub, Tech City, India - 400001</span></div>'

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw -Encoding UTF8
        if ($content -match "wa\.me") {
            continue
        }
        $new_content = $content.Replace($target_inline, $target_inline + "`n        " + $wa_snippet_inline)
        [IO.File]::WriteAllText((Resolve-Path $file).Path, $new_content, [System.Text.Encoding]::UTF8)
        Write-Host "Updated $file"
    }
}
