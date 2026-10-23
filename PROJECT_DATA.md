# Project data format

Project content lives in `data/projects.json`. `schemaVersion: 1` identifies the
block-based format. The public site still accepts the previous image `src`
property and projects whose old blocks do not yet have IDs.

## Project and block order

```json
{
  "schemaVersion": 1,
  "projects": [
    {
      "id": "example-project",
      "title": "Example Project",
      "year": "2026",
      "projectTypes": ["installation"],
      "roles": ["artist"],
      "content": []
    }
  ]
}
```

The order of `content` is the page order. Moving a block means moving that
object in the array; no separate order field is used.

Every new content block must have an ID that is unique within the project. Its
ID must stay unchanged when the block is edited or moved. A duplicated block
must receive a new ID. The future editor should generate UUIDs rather than ask
the user to enter IDs.

## Text

`language` is optional. When present it is `en` or `uk`. Languages are assigned
per block and are not required to have matching translations.

```json
{
  "id": "5fde1c97-7dc9-48ed-8bd4-d9d7714af808",
  "type": "text",
  "language": "uk",
  "text": "Окремий український текстовий блок."
}
```

## Images

Image fields are direct properties of an image block or a gallery/pair item.

```json
{
  "id": "image-main",
  "type": "image",
  "preview": "assets/projects/example/main-preview.webp",
  "large": "assets/projects/example/main-large.webp",
  "zoom": "assets/projects/example/main-zoom.webp",
  "alt": "Installation view",
  "caption": "Installation view, 2026",
  "description": "Optional archive description.",
  "credit": "Photo: Example Name",
  "showInArchive": true,
  "showInBush": true
}
```

The project page loads `large`. The archive grid loads `preview`. The project
and archive lightboxes assign `zoom` only when opened. Missing variants fall
back in this order:

- page: `large`, `src`, `preview`, `zoom`;
- archive grid: `preview`, `src`, `large`, `zoom`;
- archive lightbox: `zoom`, `large`, `src`, `preview`.

The legacy form remains valid:

```json
{ "id": "old-image", "type": "image", "src": "assets/images/10.webp" }
```

## Image pair and gallery

`imagePair` renders no more than two items. Both groups become one column on
narrow screens. Item IDs are recommended so the future editor can edit and
move media reliably inside a group.

```json
{
  "id": "pair-1",
  "type": "imagePair",
  "items": [
    { "id": "pair-left", "large": "assets/images/left.webp", "caption": "Left" },
    { "id": "pair-right", "large": "assets/images/right.webp", "caption": "Right" }
  ]
}
```

```json
{
  "id": "gallery-1",
  "type": "gallery",
  "items": [
    { "id": "gallery-a", "preview": "a-small.webp", "large": "a.webp", "zoom": "a-zoom.webp" },
    { "id": "gallery-b", "preview": "b-small.webp", "large": "b.webp", "zoom": "b-zoom.webp" }
  ]
}
```

For pair or gallery images, `showInArchive` belongs to the individual item.

## Video

The canonical video block uses `provider` and either `videoId` or `url`.
YouTube and Vimeo URLs are recognized. The old `type: "youtube"` plus
`youtubeId` form also remains supported.

```json
{
  "id": "video-1",
  "type": "video",
  "provider": "youtube",
  "videoId": "dQw4w9WgXcQ",
  "title": "Project documentation",
  "caption": "Documentation video"
}
```

```json
{
  "id": "video-2",
  "type": "video",
  "provider": "vimeo",
  "url": "https://vimeo.com/76979871"
}
```

## Links / materials

`materials` is accepted as an alias for `links`. Canonical new data should use
`links`. Only HTTP, HTTPS and mail links are made clickable.

```json
{
  "id": "materials-1",
  "type": "links",
  "title": "Materials",
  "items": [
    {
      "title": "Exhibition catalogue",
      "url": "https://example.com/catalogue",
      "description": "PDF catalogue and installation documentation."
    }
  ]
}
```

## Exhibitions and presentations

```json
{
  "id": "exhibitions-1",
  "type": "exhibitions",
  "title": "Exhibitions",
  "items": [
    {
      "year": "2026",
      "title": "Example Exhibition",
      "venue": "Example Space",
      "city": "Paris",
      "country": "France",
      "description": "Solo exhibition",
      "url": "https://example.com/exhibition"
    }
  ]
}
```

## Spacer

```json
{ "id": "space-1", "type": "spacer", "size": "medium" }
```

Valid sizes are `small`, `medium` and `large`.

## Live-preview API

`project-renderer.js` has no data-loading side effect. Saved projects and
unsaved editor drafts use the same call:

```js
import { renderProject } from "./project-renderer.js";

renderProject(draftProject, {
  metadataElement: document.querySelector("#project-metadata"),
  contentElement: document.querySelector("#project-content"),
  updateDocumentTitle: false
});
```

Calling it again replaces the previous metadata and blocks, which is suitable
for debounced live preview updates.
