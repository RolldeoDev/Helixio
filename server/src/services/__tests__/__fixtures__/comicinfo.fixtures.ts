/**
 * ComicInfo.xml Fixtures
 *
 * Sample XML content for testing ComicInfo parsing and writing.
 */

/**
 * Complete ComicInfo.xml with all fields populated.
 */
export const COMPLETE_COMICINFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Title>The Court of Owls, Part 1</Title>
  <Series>Batman</Series>
  <Number>1</Number>
  <Volume>2</Volume>
  <AlternateSeries>The New 52</AlternateSeries>
  <AlternateNumber>1</AlternateNumber>
  <AlternateCount>52</AlternateCount>
  <Summary>Batman discovers a secret society that has controlled Gotham City for centuries. The Court of Owls has sent their deadly Talon assassins after him.</Summary>
  <Notes>First appearance of the Court of Owls.</Notes>
  <Year>2011</Year>
  <Month>9</Month>
  <Day>7</Day>
  <Writer>Scott Snyder</Writer>
  <Penciller>Greg Capullo</Penciller>
  <Inker>Jonathan Glapion</Inker>
  <Colorist>FCO Plascencia</Colorist>
  <Letterer>Richard Starkings</Letterer>
  <CoverArtist>Greg Capullo</CoverArtist>
  <Editor>Mike Marts</Editor>
  <Publisher>DC Comics</Publisher>
  <Imprint>DC</Imprint>
  <Genre>Superhero, Crime, Mystery</Genre>
  <Tags>court of owls, talon, gotham</Tags>
  <Web>https://www.dccomics.com/comics/batman-2011</Web>
  <PageCount>32</PageCount>
  <LanguageISO>en</LanguageISO>
  <Format>Comic</Format>
  <Count>52</Count>
  <SeriesGroup>Batman Family</SeriesGroup>
  <StoryArc>Court of Owls</StoryArc>
  <StoryArcNumber>1</StoryArcNumber>
  <Characters>Batman, James Gordon, Dick Grayson, Lincoln March</Characters>
  <Teams>Bat-Family</Teams>
  <Locations>Gotham City, Wayne Manor, Batcave</Locations>
  <AgeRating>Teen</AgeRating>
  <BlackAndWhite>No</BlackAndWhite>
  <Manga>No</Manga>
  <ScanInformation>Digital release</ScanInformation>
  <CommunityRating>4.5</CommunityRating>
</ComicInfo>`;

/**
 * Minimal ComicInfo.xml with only required fields.
 */
export const MINIMAL_COMICINFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Series>Batman</Series>
  <Number>1</Number>
</ComicInfo>`;

/**
 * ComicInfo.xml with special characters that need escaping.
 */
export const SPECIAL_CHARS_COMICINFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Title>Spider-Man &amp; Deadpool: "Best" Friends?</Title>
  <Series>Spider-Man/Deadpool</Series>
  <Number>1</Number>
  <Summary>What happens when Spider-Man &amp; Deadpool team up? &lt;Chaos&gt; ensues!</Summary>
  <Notes>Contains &quot;special&quot; characters: &lt;&gt;&amp;&apos;</Notes>
  <Publisher>Marvel Comics</Publisher>
</ComicInfo>`;

/**
 * ComicInfo.xml with manga-style settings.
 */
export const MANGA_COMICINFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Series>One Piece</Series>
  <Number>1</Number>
  <Volume>1</Volume>
  <Writer>Eiichiro Oda</Writer>
  <Penciller>Eiichiro Oda</Penciller>
  <Publisher>Shueisha</Publisher>
  <Year>1997</Year>
  <LanguageISO>ja</LanguageISO>
  <Manga>YesAndRightToLeft</Manga>
  <BlackAndWhite>Yes</BlackAndWhite>
</ComicInfo>`;

/**
 * ComicInfo.xml with Pages section.
 */
export const COMICINFO_WITH_PAGES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Series>Batman</Series>
  <Number>1</Number>
  <PageCount>32</PageCount>
  <Pages>
    <Page Image="0" Type="FrontCover" ImageWidth="1988" ImageHeight="3056"/>
    <Page Image="1" Type="InnerCover"/>
    <Page Image="2" Type="Story"/>
    <Page Image="3" Type="Story"/>
    <Page Image="30" Type="Story"/>
    <Page Image="31" Type="BackCover"/>
  </Pages>
</ComicInfo>`;

/**
 * Malformed ComicInfo.xml (missing closing tag).
 */
export const MALFORMED_COMICINFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Series>Batman</Series>
  <Number>1
</ComicInfo>`;

/**
 * Empty ComicInfo.xml (valid but no content).
 */
export const EMPTY_COMICINFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
</ComicInfo>`;

/**
 * ComicInfo.xml without root element.
 */
export const NO_ROOT_COMICINFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<WrongRoot>
  <Series>Batman</Series>
</WrongRoot>`;

/**
 * ComicInfo.xml with multiple creators (comma-separated).
 */
export const MULTIPLE_CREATORS_COMICINFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Series>Justice League</Series>
  <Number>1</Number>
  <Writer>Geoff Johns, Jim Lee</Writer>
  <Penciller>Jim Lee</Penciller>
  <Inker>Scott Williams</Inker>
  <Colorist>Alex Sinclair, Hi-Fi</Colorist>
  <Publisher>DC Comics</Publisher>
  <Year>2011</Year>
</ComicInfo>`;

/**
 * ComicInfo.xml with volume number in series name.
 */
export const VOLUME_IN_NAME_COMICINFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Series>Batman (2016)</Series>
  <Number>1</Number>
  <Volume>3</Volume>
  <Publisher>DC Comics</Publisher>
  <Year>2016</Year>
</ComicInfo>`;

/**
 * ComicInfo.xml with decimal issue number.
 */
export const DECIMAL_ISSUE_COMICINFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Series>Batman</Series>
  <Number>0.5</Number>
  <Title>Prelude</Title>
  <Publisher>DC Comics</Publisher>
</ComicInfo>`;

/**
 * ComicInfo.xml with alpha issue number.
 */
export const ALPHA_ISSUE_COMICINFO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Series>Batman</Series>
  <Number>1A</Number>
  <Title>Variant Cover</Title>
  <Publisher>DC Comics</Publisher>
</ComicInfo>`;

/**
 * Expected parsed ComicInfo object from COMPLETE_COMICINFO_XML.
 */
export const EXPECTED_COMPLETE_COMICINFO = {
  Title: 'The Court of Owls, Part 1',
  Series: 'Batman',
  Number: '1',
  Volume: 2,
  AlternateSeries: 'The New 52',
  AlternateNumber: '1',
  AlternateCount: 52,
  Summary: 'Batman discovers a secret society that has controlled Gotham City for centuries. The Court of Owls has sent their deadly Talon assassins after him.',
  Notes: 'First appearance of the Court of Owls.',
  Year: 2011,
  Month: 9,
  Day: 7,
  Writer: 'Scott Snyder',
  Penciller: 'Greg Capullo',
  Inker: 'Jonathan Glapion',
  Colorist: 'FCO Plascencia',
  Letterer: 'Richard Starkings',
  CoverArtist: 'Greg Capullo',
  Editor: 'Mike Marts',
  Publisher: 'DC Comics',
  Imprint: 'DC',
  Genre: 'Superhero, Crime, Mystery',
  Tags: 'court of owls, talon, gotham',
  Web: 'https://www.dccomics.com/comics/batman-2011',
  PageCount: 32,
  LanguageISO: 'en',
  Format: 'Comic',
  Count: 52,
  SeriesGroup: 'Batman Family',
  StoryArc: 'Court of Owls',
  StoryArcNumber: '1',
  Characters: 'Batman, James Gordon, Dick Grayson, Lincoln March',
  Teams: 'Bat-Family',
  Locations: 'Gotham City, Wayne Manor, Batcave',
  AgeRating: 'Teen',
  BlackAndWhite: 'No' as const,
  Manga: 'No' as const,
  ScanInformation: 'Digital release',
  CommunityRating: 4.5,
};

/**
 * Expected parsed ComicInfo object from MINIMAL_COMICINFO_XML.
 */
export const EXPECTED_MINIMAL_COMICINFO = {
  Series: 'Batman',
  Number: '1',
};
