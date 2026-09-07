from pathlib import Path
p=Path('src/core/administration/mod/caseCourt.js')
s=p.read_text()
repls={
"Internal court file • verified evidence only may be represented in the published member record":"Internal case file • only verified evidence may be represented in the published member record",
"const judge = court.reviewingAdminId ?":"const reviewer = court.reviewingAdminId ?",
"court.reviewingAdminId ? '✅ Judge assigned' : '⚠️ Awaiting judge claim'":"court.reviewingAdminId ? '✅ Reviewer assigned' : '⚠️ Awaiting reviewer claim'",
"**Decision by:** ${judge}":"**Decision by:** ${reviewer}",
"A judge must claim the review before recording a decision":"An authorised reviewer must claim the case before recording a decision",
"const judgeAuthority = isJudge(interaction);":"const judgeAuthority = isJudge(interaction);",
"'Assigned to Another Judge'":"'Assigned to Another Reviewer'",
"Decision, publication and appeal history for this Court Case. Internal evidence and private staff notes are intentionally excluded.":"Decision, publication and appeal history for this case. Internal evidence and private staff notes are intentionally excluded.",
".setTitle('Close Court Case')":".setTitle('Close Case')",
".setTitle('Record Court Decision')":".setTitle('Record Case Decision')",
"Another judge has already claimed this review.":"Another reviewer has already claimed this review.",
"Only the assigned judge can return this case for more work.":"Only the assigned reviewer can return this case for more work.",
"Judge returned the case to investigation for further work.":"Reviewer returned the case to investigation for further work.",
"The deciding judge cannot also approve the ban. A second admin must approve it.":"The admin who recorded the decision cannot also approve the ban. A second admin must approve it.",
"Admin authority is required to act as case judge.":"Case-review authority is required to record a decision.",
"Court publishing authority is required to publish the member record.":"Case-publishing authority is required to publish the member record.",
"`**#${entry.caseId}** • Severity **${parseCourt(entry).severity}/5**\\n${cleanExcerpt(parseCourt(entry).allegations, 160)}`":"`**#${entry.caseId}** • Severity **${severityText(parseCourt(entry).severity)}**\\n${cleanExcerpt(parseCourt(entry).allegations, 160)}`",
}
for a,b in repls.items():
    if a not in s:
        if a == "const judgeAuthority = isJudge(interaction);":
            continue
        raise SystemExit(f'missing anchor: {a}')
    s=s.replace(a,b)
p.write_text(s)
