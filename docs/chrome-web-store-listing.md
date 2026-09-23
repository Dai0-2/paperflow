# PaperFlow AI Chrome Web Store Listing

Use this document as the copy source for Chrome Web Store Developer Dashboard.
The default listing language is English.

## Current release identifiers

- Chrome Web Store item ID: `dffiahjmpkmellmjijffpcofoahbccoc`
- Version: `1.0.0`
- Pricing: Free
- Initial visibility: Unlisted

Do not submit the current draft for review yet. Before submission:

1. Copy the Web Store public key into `manifest.base.json` so unpacked and
   published builds use the store item ID above.
2. Create a Chrome Extension OAuth client for the store item ID.
3. Build and upload `paperflow-ai-release.zip` with
   `PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID` configured.
4. Publish `docs/privacy.md` at a stable public URL.
5. Complete real Google Drive and signed Native Host release testing.

## Store listing

### Category

Choose:

```text
Productivity
```

In the Chinese dashboard this category is shown as:

```text
效率
```

### Language

Choose:

```text
English
```

### Detailed description

```text
PaperFlow is a local-first research workspace for reading, annotating, organizing, and discussing academic papers.

Open arXiv and direct PDF links in an integrated reader while preserving the original source URL. Highlight, underline, strike through, draw, add comments and area notes, search documents, and run local OCR for scanned pages.

Organize papers with nested collections, tags, favorites, and recently read views. Notes, annotations, conversations, and reading progress are stored locally.

AI features are optional. Users can connect an existing Codex subscription through the local Native Host or configure an OpenAI-compatible API endpoint. Content is sent only when the user explicitly invokes an AI action.

Optional encrypted Google Drive synchronization keeps library records, notes, annotations, conversations, and selected offline PDFs available across devices. Data is encrypted on the device before upload.

PaperFlow contains no advertising, analytics, tracking, or telemetry.
```

### Images

- Store icon: use `public/icons/paperflow-128.png`.
- Screenshots: upload PNG or JPEG at `1280 x 800` or `640 x 400`.
- Recommended screenshots: Reader, annotation workflow, AI conversation, and
  Library.
- Do not show API keys, email addresses, vault passwords, recovery keys, or
  private paper content.
- Promotional video and promotional tiles are optional for the initial draft.

### Other fields

- Official website: leave empty until a verified project website exists.
- Homepage URL: use the public project homepage after the repository is public.
- Support URL: use the public issue/support page after the repository is public.
- Adult content: Off.

Do not invent temporary website or support URLs.

## Privacy

### Single purpose

```text
PaperFlow provides a local-first workspace for reading, annotating, organizing, and discussing academic research papers.
```

### Permission justifications

#### sidePanel

```text
Displays the PaperFlow research workspace beside the paper being read.
```

#### storage

```text
Stores lightweight interface preferences, language settings, and redirect-loop protection flags locally.
```

#### tabs

```text
Identifies the active PDF or research-paper tab and opens the Reader or Library when requested by the user.
```

#### nativeMessaging

```text
Communicates with the optional local PaperFlow Native Host to access the Codex CLI and store credentials in the operating-system credential store.
```

#### contextMenus

```text
Provides user-invoked commands for opening PDFs in PaperFlow, saving papers, and opening the Library.
```

#### identity

```text
Requests Google authorization for the optional encrypted Google Drive synchronization feature. OAuth tokens remain managed by Chrome Identity.
```

#### alarms

```text
Schedules bounded background synchronization and retry work for the optional Google Drive vault.
```

#### arXiv host access

```text
Mounts the integrated PaperFlow Reader on user-opened arXiv paper pages while preserving the original arXiv URL.
```

#### Optional HTTP and HTTPS host access

```text
Requested only when the user explicitly opens a PDF or refreshes paper metadata from its source. PaperFlow does not inspect arbitrary browsing activity.
```

### Remote code

Choose:

```text
No, I am not using remote code.
```

All executable application, PDF.js, OCR, and language resources are packaged
inside the extension. AI and metadata HTTPS requests exchange data with user
selected services but do not download or execute code.

### Data-use disclosure

Disclose the following categories because the associated data may leave the
device when the user explicitly uses AI or encrypted Drive sync:

- Website content: selected text, current-page text, relevant paper chunks,
  paper metadata, and explicitly selected attachments.
- Personal communications: user prompts, AI conversation history, and notes.
- Authentication information: user-provided API credentials handled through
  the Native Host and OAuth authorization managed by Chrome Identity.
- User activity: reading state and recently read research items included in the
  optional encrypted vault.
- Web history: source URLs and access timestamps for research papers included
  in the optional encrypted vault.

Do not select personally identifiable information, health information,
financial information, location, or payment information. PaperFlow does not
request the user's Google profile or email address.

For every disclosed category, select only:

```text
App functionality
```

Confirm all applicable limited-use declarations:

- Data is not sold.
- Data is not used for advertising.
- Data is not used for creditworthiness or lending.
- Data is not used for purposes unrelated to PaperFlow's single purpose.
- Network transfers use HTTPS.
- Drive library records and optional PDF backups are encrypted locally before
  upload.

### Privacy policy

Publish `docs/privacy.md` at a stable public URL and enter that exact HTTPS URL.
Do not use a local file path, temporary preview URL, or fabricated URL.

## Test instructions

```text
No account is required to test the core Reader and Library.

1. Install the extension.
2. Open a public arXiv paper, for example https://arxiv.org/pdf/2507.16806.
3. Open the PaperFlow side panel or use a PaperFlow context-menu command.
4. Test PDF navigation, search, highlighting, comments, annotations, and saving the paper to the Library.
5. Open the PaperFlow Library from the extension menu and test collections, tags, search, and recently read items.

AI features are optional and require either the separately installed PaperFlow Native Host with Codex authentication or a user-provided OpenAI-compatible API endpoint.

Google Drive synchronization is optional and requires Google authorization plus a user-created encrypted vault password.
```

Do not provide reviewer credentials, API keys, recovery keys, or personal
Google account access.

## Distribution

For private release testing:

- Visibility: Unlisted.
- Regions: All regions.
- Pricing: Free.

Change visibility to Public only after the OAuth-enabled package, privacy
policy, real Drive test, signed Native Host downloads, support URL, and store
assets are ready.

## Final submission gate

- [ ] Store public key maps the unpacked build to
  `dffiahjmpkmellmjijffpcofoahbccoc`.
- [ ] Google OAuth client type is Chrome Extension and uses the same item ID.
- [ ] Google Drive API is enabled and the only Drive scope is `drive.file`.
- [ ] Final uploaded ZIP is `paperflow-ai-release.zip`, not the
  credential-free item-ID reservation package.
- [ ] Privacy policy URL is public and stable.
- [ ] Store screenshots contain no secrets or private data.
- [ ] Two-profile or two-device encrypted sync test passes.
- [ ] Native Host downloads are signed, checksummed, and publicly reachable.
- [ ] Product details, privacy declarations, distribution, and test
  instructions are saved.
- [ ] Review submission is performed manually by the publisher.
