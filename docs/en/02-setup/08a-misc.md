# 08a. Other: project language and diagnostics

**Optional.** A small section with two settings that did not fit anywhere else.

## Where

**Project Settings → Apps → Smart Sprint Planner → PLANNING → Other**.

## The project's default language

The planner supports fifteen languages. Each person picks their own in the rail header, and the choice is remembered for them personally.

**The project's default language** answers what someone who has never chosen sees. If it is not set, the planner takes the browser's language, and if it does not recognise that either, English.

Worth setting when the team speaks one language: a new member then does not have to switch it by hand.

⚠️ A person's own choice always beats the project default.

## The diagnostic log panel

The **Show diagnostic log panel** switch adds an expandable panel at the bottom of the settings screen with a journal of the planner's actions and **Clear** and **Export TXT** buttons.

The panel is for investigating an incident: the journal shows which requests went to the server, what came back and where a permission check fired.

Keep it off during ordinary work — it does no harm but takes space and confuses users.

## Verbose logging

A separate **Verbose logging (diagnostics only)** checkbox lives not here but in YouTrack's app parameters (chapter [04](04-manager-group.md)). It increases the journal's detail. Switch it on only while investigating.
