import { describe, expect, it } from "vitest";
import { parseTibiaBook } from "../../src/learning/tibia-books.js";

describe("Tibia books", () => {
  it("extracts text, location, author, libraries and sequence", () => {
    const book = parseTibiaBook("Test Book (Book)", `{{Infobox Book
| booktype = Book (Brown)
| title = The Test
| location = [[Thais]] church<br>upper floor
| blurb = A short description.
| author = [[Muriel]].
| returnpage = Thais Libraries
| returnpage2 = Edron Libraries
| prevbook = First Volume
| nextbook = Third Volume
| relatedpages = [[469]], [[Bonelords|Bonelord]]
| text = <pre>Hello, adventurer!<br>Keep 0152551751 unchanged.</pre>
| implemented = 7.4
}}`);
    expect(book).toMatchObject({
      title: "The Test", location: "Thais church\nupper floor", author: "Muriel",
      libraries: ["Thais Libraries", "Edron Libraries"], previousBook: "First Volume",
      nextBook: "Third Volume", relatedPages: ["469", "Bonelord"],
      text: "Hello, adventurer!\nKeep 0152551751 unchanged."
    });
  });
});
