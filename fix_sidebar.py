content = open('admin-dashboard.html', encoding='utf-8').read()

needle = 'anav-hospitals'
idx = content.find(needle)
if idx == -1:
    print("NOT FOUND: anav-hospitals")
else:
    # Find the closing </button> after the hospitals button
    close_tag = '</button>'
    btn_end = content.find(close_tag, idx)
    insert_pos = btn_end + len(close_tag)
    
    new_btn = '\n      <button class="sidebar-nav-item" id="anav-medicines" onclick="switchAdminPanel(\'medicines\')">\n        <span class="nav-icon">\U0001f48a</span> Medicine Database\n      </button>'
    
    # Check if already inserted
    if 'anav-medicines' in content:
        print("ALREADY EXISTS")
    else:
        content = content[:insert_pos] + new_btn + content[insert_pos:]
        open('admin-dashboard.html', 'w', encoding='utf-8').write(content)
        print("SUCCESS")
