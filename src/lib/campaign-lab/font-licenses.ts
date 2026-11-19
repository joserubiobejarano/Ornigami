export type BundledFontLicense = {
  family: string;
  copyright: string;
  licenseName: string;
  licenseFile: string;
  licenseText: string;
};

const OFL_1_1 = `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION AND CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.`;

const INTER_LICENSE: BundledFontLicense = {
  family: "Inter",
  copyright:
    "Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)",
  licenseName: "SIL Open Font License 1.1",
  licenseFile: "fonts/LICENSE-Inter-OFL-1.1.txt",
  licenseText: `Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL

-----------------------------------------------------------
${OFL_1_1}
-----------------------------------------------------------`,
};

const EB_GARAMOND_LICENSE: BundledFontLicense = {
  family: "EB Garamond",
  copyright:
    "Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12)",
  licenseName: "SIL Open Font License 1.1",
  licenseFile: "fonts/LICENSE-EB-Garamond-OFL-1.1.txt",
  licenseText: `Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL

-----------------------------------------------------------
${OFL_1_1}
-----------------------------------------------------------`,
};

const JOST_LICENSE: BundledFontLicense = {
  family: "Jost",
  copyright:
    "Copyright 2020 The Jost Project Authors (https://github.com/indestructible-type/Jost)",
  licenseName: "SIL Open Font License 1.1",
  licenseFile: "fonts/LICENSE-Jost-OFL-1.1.txt",
  licenseText: `Copyright 2020 The Jost Project Authors (https://github.com/indestructible-type/Jost)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL

-----------------------------------------------------------
${OFL_1_1}
-----------------------------------------------------------`,
};

const LICENSES: readonly BundledFontLicense[] = [
  INTER_LICENSE,
  EB_GARAMOND_LICENSE,
  JOST_LICENSE,
];

// New self-hosted faces use exact real names, not the historical alias matcher.
const LOCAL_LICENSES: readonly BundledFontLicense[] = [
    ["Bricolage Grotesque", "Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage)"],
    ["Geist Mono", "Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font.git)"],
  ].map(([family, copyright]) => ({
    family, copyright, licenseName: "SIL Open Font License 1.1",
    licenseFile: `fonts/LICENSE-${family.replaceAll(" ", "-")}-OFL-1.1.txt`,
    licenseText: `${copyright}\n\n${OFL_1_1}\n`,
  }));

function normalizedFamily(family: string): string {
  return family
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Only fonts with a reviewed notice may enter a standalone archive. An
 * unknown family must fail the export instead of shipping a font file without
 * its matching copyright and license text.
 */
export function findFontLicense(family: string): BundledFontLicense | null {
  const normalized = normalizedFamily(family);
  return (
    LOCAL_LICENSES.find((license) => normalizedFamily(license.family) === normalized) ??
    LICENSES.find((license) => normalizedFamily(license.family) === normalized) ??
    LICENSES.find((license) =>
      normalized.includes(normalizedFamily(license.family)),
    ) ??
    null
  );
}

export function buildFontNotice(
  entries: readonly {
    family: string;
    file: string;
    license: BundledFontLicense;
  }[],
): string {
  const lines = [
    "Bundled font notices",
    "",
    "This local Campaign Lab export includes the font files listed below.",
    "Each family is bundled with its matching copyright and license text.",
    "",
  ];

  for (const entry of entries) {
    lines.push(
      `${entry.file}`,
      `  family: ${entry.family}`,
      `  copyright: ${entry.license.copyright}`,
      `  license: ${entry.license.licenseName}`,
      `  license file: ${entry.license.licenseFile}`,
      "",
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
