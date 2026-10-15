# deClaude: presentation script

Group 1. Ten slides, five speakers, two slides each, about 2 minutes per person. The whole talk is about 10 minutes, plus questions.

| # | Speaker | Slides | Time |
|---|---|---|---|
| 1 | Aakansha Johari | 1 Title, 2 The brief | 0:00 to 2:00 |
| 2 | Shivam Singh | 3 Research, 4 The 24 patterns | 2:00 to 4:00 |
| 3 | Akshat Jha | 5 SKILL.md, 6 The app (live demo) | 4:00 to 6:15 |
| 4 | Eishita Mehta | 7 Results, 8 AI detectors | 6:15 to 8:15 |
| 5 | Ekagra Sharma | 9 Blind test, 10 What we learned | 8:15 to 10:15 |

Lines in *italics* are cues, not things to say. Say the lines in your own words. If you read them word for word, you'll sound like the thing we're presenting against.

**Before we start**
- Deck open at https://declaude-nine.vercel.app/deck/, full screen. Use the arrow keys to move between slides.
- App open in a second tab, already past the passcode screen. Don't put the passcode on screen.
- The LinkedIn post from `docs/test-report/samples-original.md` (sample 4) copied to the clipboard for Akshat's demo.
- Backup: the PDF (`app/deck/deClaude-deck.pdf`) on a laptop, in case the projector machine has no internet.

---

## 1. Aakansha Johari: slides 1 and 2

### Slide 1: Title (about 30 seconds)

Good morning. We're Group 1: I'm Aakansha, and with me are Shivam, Akshat, Eishita and Ekagra.

Our project is called deClaude. You paste in something a chatbot wrote, and you get it back in plain human, with every edit marked in red pen so you can see what changed and why.

It's live right now. If you want to follow along, scan the code in the corner. It works on your phone.

*Next slide.*

### Slide 2: The brief (about 1.5 minutes)

The brief asked for an app and a SKILL.md that deClaude AI-generated content, *point to the highlight* "so no one can tell it is AI."

The first thing we had to decide was who "no one" is. There are two options. One is an AI detector, a tool like GPTZero that gives you a percentage. The other is a person reading what you wrote. We picked the person. A detector is one company's model guessing; a reader is who the writing is actually for. We still ran the detectors, and Eishita will show you how that went. It's humbling.

On the right are the six things the brief asks for. Five are done. The blind test with classmates is still running, which is why it says "running" and not "done." Every row is a link, so after today you can open any of these yourself.

To work out what makes text sound like AI, we didn't start by guessing. We started by reading what other people had already built. Shivam.

---

## 2. Shivam Singh: slides 3 and 4

### Slide 3: Research (about 1 minute)

Before we wrote a single rule, we read the 21 most-starred and most-forked de-AI tools on GitHub. Not just the descriptions: their prompt files, their pattern lists, and the complaints in their issues.

Three things stood out. *Point to each finding on the right.*

First, word lists are going stale. Wikipedia keeps a guide to spotting AI writing, and it now files em-dash overuse under "historical indicators." The models have learned to stop saying "delve."

Second, these tools break their own rules. One called stop-slop bans em dashes, and its own example output has an em dash in it.

Third, the only blind test we found. Readers preferred the humanised version 16 times out of 16. AI detection on the same text barely moved, from 100 percent to 98.6. So readers and detectors are measuring different things, which is why we chose readers.

*Next slide.*

### Slide 4: The 24 patterns (about 1 minute)

From that reading we built a list of 24 patterns, grouped into five families: punctuation, words, templates, claims and rhythm. *Gesture across the five boxes.* Some you'll recognise, like "it's not just X, it's Y." Some are harder to spot, like every sentence being the same length.

Then we tested the list on Claude's own drafts: five pieces, 32 tells. *Point to the zero.* Not one of those 32 was an "AI word." The biggest offender was bold lead-ins, those bolded labels at the start of a paragraph, 11 of them. Next came groups of three, 6.

So the tells have moved from words to structure. A find-and-replace on "delve" doesn't work any more. You need rules about how the text is built. Akshat will show you those rules.

---

## 3. Akshat Jha: slides 5 and 6

### Slide 5: SKILL.md (about 45 seconds)

SKILL.md is the rulebook. It's what we hand the AI every time it rewrites something. Eight hard rules on the left.

Rule 1 is the obvious one, no em dashes. The two that matter most aren't about style at all: rule 2, add no facts, and rule 3, keep every fact. A rewrite that sounds human but drops your deadline is worse than the original.

*Point to the example.* This is from a cafe listing. "Nestled in the heart of Bandra, boasts a truly vibrant, welcoming, and cozy atmosphere." All of that goes. What stays is the 12 tables, because that's the actual information.

The file has 16 before-and-after examples like this, and we test every one against our own detector each time we change anything.

*Next slide.*

### Slide 6: The app, live demo (about 1.5 minutes)

Here's how it works. *Point along the strip.* It scans your text in the browser, a free AI model rewrites it using SKILL.md, then our code checks the rewrite for lost facts and leftover tells, and fixes it once more if it needs to. The last step is yours. I'll show you what that means.

*Switch to the app tab. Paste the LinkedIn post. Press STRIP IT.*

This is a LinkedIn post Claude wrote about finishing first year at business school. You'll know the type. *While it runs, which can take up to 30 seconds:* it's on a free model, so it's not instant, but it costs us nothing to run.

*When the result appears:*
- Up top is the tell count, before and after.
- Every red-pen edit is numbered on both sides, so you can match what was cut to what replaced it. *Hover or click one.*
- This toggle switches between the edits and the AI tells it found.
- And this is "Your turn." *Scroll to it.* These are questions only the writer can answer. The app won't invent your experience for you, so it asks. You can edit the rewrite right here and then copy or download it.

*If it's slow or fails:* "Free tiers have limits, so here's one we ran earlier." Switch back to the deck and talk through the screenshot on the slide.

So does it actually work? Eishita has the numbers.

---

## 4. Eishita Mehta: slides 7 and 8

### Slide 7: Results (about 1 minute)

We tested the app on five pieces Claude wrote from plain prompts: an email, a blog post, a product description, a LinkedIn post and a cover letter. Across all five there were 32 tells. After the rewrite, 7.

*Point to the LinkedIn box.* The LinkedIn post you just saw went from 11 to 1. What got cut: five bold lead-ins, the "looking forward to year two" closer, the engagement question at the end, and the hashtag row.

But we didn't trust the scores on their own. We read every rewrite by hand. *Point to the line at the bottom.* Two things went wrong. The product description lost "laptop sleeve" from a list, and the email gained a line, "I appreciate your flexibility," that the original never had. Everything else survived. Each rewrite took between 3 and 33 seconds.

*Next slide.*

### Slide 8: AI detectors (about 1 minute)

Then we ran the obvious test: does this fool AI detectors? It doesn't.

*Point to GPTZero.* GPTZero called every text it saw 100 percent AI, "highly confident," and that includes our rewrites. We could only check five texts before the free version cut us off.

*Point to Sapling.* Sapling is the strange one. It said the blog post was 99.5 percent AI, and then, once the bold labels were gone, 0 percent. A round later it did the same with the LinkedIn post. A score that swings that much on one formatting change isn't proof of anything.

We chose not to add tricks like hidden characters to beat these tools. That wasn't the goal. The real question is whether people can tell, and that's the blind test. Ekagra.

---

## 5. Ekagra Sharma: slides 9 and 10

### Slide 9: Blind test (about 1 minute)

This is the test the brief actually asks for. There are three versions of each piece. *Point to each letter.* O is Claude's original, R is our rewrite, and H was written by one of us from the same prompt with no AI at all.

We split them across two forms so nobody reads two versions of the same piece. Each classmate reads 10 short pieces and says "person or AI," and how sure they are, from 1 to 5.

*Say whichever version matches the slide on the day:*

- **Results not in yet:** "This is still running, so we're not going to show you numbers we don't have. When the responses are in, this chart fills in and the report updates with it."
- **Results in:** "We had [n] classmates take it. They called Claude's originals AI [x] percent of the time, our rewrites [y] percent, and the human pieces [z] percent." *Read the numbers off the slide. Don't round them up.*

*Next slide.*

### Slide 10: What we learned (about 1 minute)

Three things. *One box at a time.*

A clean score can hide a bad edit. Our early runs scored almost zero tells while quietly dropping the reason for a deadline and a product's care instructions. That's why the app now checks facts, not just tells.

Fast models cut corners. The free model answers in seconds, but it dropped sentences until we added checks for that. One model stopped writing mid-sentence, so we test for that as well.

And the last step is yours. Every detector still flagged our rewrites. What makes writing sound like a person is the detail only that person has. So the app doesn't end with a rewrite. It ends with a question.

*Point to the bottom row.* The limits are listed here. We built this with Claude Code, which is a little ironic, and every tool and prompt we used is in the AI log, linked on this slide.

That's deClaude. Thank you. The app and every deliverable are on the QR code. We're happy to take questions.

---

## Likely questions

| Question | Who answers | Short answer |
|---|---|---|
| Isn't this a tool for cheating? | Ekagra | Detectors still catch it, and we didn't try to beat them. It removes filler and then asks the writer for their own detail. |
| Why not just tell ChatGPT "write like a human"? | Akshat | It swaps one tell for another and drops facts. SKILL.md rule 5 and the fact checks exist because of exactly that. |
| How do you know it didn't change the meaning? | Eishita | Code checks numbers and sentences, and we read every rewrite by hand. One list item lost, one line added, both reported. |
| Where did the 24 patterns come from? | Shivam | 21 GitHub tools, Wikipedia's guide, then tested against Claude's own drafts. |
| What does it cost to run? | Akshat | Nothing. Vercel's free plan and free model tiers. The trade-off is speed and daily limits. |
| Why only English? | Aakansha | The detectors are tuned for English. Other languages go through, but the scan misses tells. It's on the limits list. |
