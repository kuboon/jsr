/**
 * The share-intent URLs behind `<share-dialog>`'s X/LINE/Threads buttons. Pure and DOM-free, so
 * they're testable without a browser — the part of this package that actually can be.
 */

/** Opens X's (Twitter's) tweet-composer intent, pre-filled with `url`. */
export function xShareUrl(url: string): string {
  return `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`;
}

/** Opens LINE's share intent for `url`. */
export function lineShareUrl(url: string): string {
  return `https://social-plugins.line.me/lineit/share?url=${
    encodeURIComponent(url)
  }`;
}

/**
 * Opens Threads' post-composer intent, pre-filled with `url`.
 *
 * Threads has no separate `url` parameter — the link itself becomes the post's text, which the
 * app unfurls into a preview card.
 */
export function threadsShareUrl(url: string): string {
  return `https://www.threads.net/intent/post?text=${encodeURIComponent(url)}`;
}
