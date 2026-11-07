import { RE2JS } from 're2js';

const MAX_PATTERN_BYTES = 4096;
const MAX_PROGRAM_COST = 16_384;
const MAX_GROUP_DEPTH = 64;
const MAX_FILE_PATTERNS = 10_000;
const MAX_FILE_PATTERN_BYTES = 4 * 1024 * 1024;
const MAX_FILE_PROGRAM_COST = 2_000_000;
const MAX_CACHE_ENTRIES = 512;
const accepted = new Map<string, number>();

const GO_UNICODE_CLASSES = new Set(
    `Adlam Ahom Anatolian_Hieroglyphs Any Ascii Assigned Lc Arabic Armenian Avestan
Balinese Bamum Bassa_Vah Batak Bengali Beria_Erfe Bhaiksuki Bopomofo Brahmi Braille Buginese Buhid
C Canadian_Aboriginal Carian Caucasian_Albanian Cc Cf Chakma Cham Cherokee Chorasmian Cn Co Common
Coptic Cs Cuneiform Cypriot Cypro_Minoan Cyrillic Deseret Devanagari Dives_Akuru Dogra Duployan
Egyptian_Hieroglyphs Elbasan Elymaic Ethiopic Garay Georgian Glagolitic Gothic Grantha Greek Gujarati
Gunjala_Gondi Gurmukhi Gurung_Khema Han Hangul Hanifi_Rohingya Hanunoo Hatran Hebrew Hiragana
Imperial_Aramaic Inherited Inscriptional_Pahlavi Inscriptional_Parthian Javanese Kaithi Kannada Katakana
Kawi Kayah_Li Kharoshthi Khitan_Small_Script Khmer Khojki Khudawadi Kirat_Rai L LC Lao Latin Lepcha
Limbu Linear_A Linear_B Lisu Ll Lm Lo Lt Lu Lycian Lydian M Mahajani Makasar Malayalam Mandaic
Manichaean Marchen Masaram_Gondi Mc Me Medefaidrin Meetei_Mayek Mende_Kikakui Meroitic_Cursive
Meroitic_Hieroglyphs Miao Mn Modi Mongolian Mro Multani Myanmar N Nabataean Nag_Mundari Nandinagari
Nd New_Tai_Lue Newa Nko Nl No Nushu Nyiakeng_Puachue_Hmong Ogham Ol_Chiki Ol_Onal Old_Hungarian
Old_Italic Old_North_Arabian Old_Permic Old_Persian Old_Sogdian Old_South_Arabian Old_Turkic Old_Uyghur
Oriya Osage Osmanya P Pahawh_Hmong Palmyrene Pau_Cin_Hau Pc Pd Pe Pf Phags_Pa Phoenician Pi Po Ps
Psalter_Pahlavi Rejang Runic S Samaritan Saurashtra Sc Sharada Shavian Siddham Sidetic SignWriting
Sinhala Sk Sm So Sogdian Sora_Sompeng Soyombo Sundanese Sunuwar Syloti_Nagri Syriac Tagalog Tagbanwa
Tai_Le Tai_Tham Tai_Viet Tai_Yo Takri Tamil Tangsa Tangut Telugu Thaana Thai Tibetan Tifinagh Tirhuta
Todhri Tolong_Siki Toto Tulu_Tigalari Ugaritic Vai Vithkuqi Wancho Warang_Citi Yezidi Yi Z
Zanabazar_Square Zl Zp Zs`.split(/\s+/),
);

function patternCost(pattern: string): number {
    const frames = [{ total: 0, atom: 0 }];
    let inClass = false,
        classStart = 0,
        quoted = false;
    const atom = (cost: number) => {
        const frame = frames.at(-1)!;
        frame.total += cost;
        frame.atom = cost;
        if (frame.total > MAX_PROGRAM_COST) throw Error('geofile-regexp-complexity');
    };
    for (let index = 0; index < pattern.length; index++) {
        const rune = pattern.codePointAt(index)!;
        if (rune >= 0xd800 && rune <= 0xdfff) throw Error('geofile-regexp');
        if (rune > 0xffff) index++;
        const c = String.fromCodePoint(rune);
        if (quoted) {
            if (c === '\\' && pattern[index + 1] === 'E') {
                quoted = false;
                index++;
            } else atom(2);
            continue;
        }
        if (c === '\\') {
            const escape = pattern[++index];
            if (escape === 'Q' && !inClass) {
                quoted = true;
                continue;
            }
            if (escape === 'p' || escape === 'P') {
                let name: string;
                if (pattern[index + 1] === '{') {
                    const end = pattern.indexOf('}', index + 2);
                    if (end < 0) throw Error('geofile-regexp');
                    name = pattern.slice(index + 2, end);
                    index = end;
                } else name = pattern[++index] ?? '';
                if (name.startsWith('^')) name = name.slice(1);
                if (!GO_UNICODE_CLASSES.has(name)) throw Error('geofile-regexp');
            }
            if (escape === 'x' && pattern[index + 1] === '{') {
                const end = pattern.indexOf('}', index + 2);
                if (end < 0) throw Error('geofile-regexp');
                index = end;
            }
            if (!inClass) atom(2);
            continue;
        }
        if (inClass) {
            if (c === ']' && index > classStart + (pattern[classStart + 1] === '^' ? 2 : 1))
                inClass = false;
            continue;
        }
        if (c === '[') {
            inClass = true;
            classStart = index;
            atom(32);
            continue;
        }
        if (c === '(') {
            if (frames.length >= MAX_GROUP_DEPTH) throw Error('geofile-regexp-complexity');
            frames.push({ total: 0, atom: 0 });
        } else if (c === ')') {
            if (frames.length < 2) throw Error('geofile-regexp');
            atom(frames.pop()!.total + 2);
        } else if (c === '{') {
            const repeat = /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(index));
            if (!repeat) {
                atom(2);
                continue;
            }
            const maximum = Number(repeat[2] === '' ? repeat[1] : (repeat[2] ?? repeat[1]));
            if (!Number.isSafeInteger(maximum) || maximum > 1000) throw Error('geofile-regexp');
            const frame = frames.at(-1)!;
            const cost = frame.atom * Math.max(1, maximum) + 2;
            frame.total -= frame.atom;
            atom(cost);
            index += repeat[0].length - 1;
        } else if ('*+?'.includes(c)) {
            const frame = frames.at(-1)!;
            frame.total += 2;
            frame.atom += 2;
            if (frame.total > MAX_PROGRAM_COST) throw Error('geofile-regexp-complexity');
        } else atom(2);
    }
    if (frames.length !== 1) throw Error('geofile-regexp');
    return frames[0].total;
}

export function createGoRegexpValidator(): (pattern: string) => void {
    const seen = new Set<string>();
    let bytes = 0,
        cost = 0;
    return (pattern) => {
        if (typeof pattern !== 'string' || Buffer.byteLength(pattern) > MAX_PATTERN_BYTES)
            throw Error('geofile-regexp');
        if (seen.has(pattern)) return;
        bytes += Buffer.byteLength(pattern);
        if (seen.size >= MAX_FILE_PATTERNS || bytes > MAX_FILE_PATTERN_BYTES)
            throw Error('geofile-regexp-complexity');
        const cached = accepted.get(pattern);
        const estimate = cached ?? patternCost(pattern);
        cost += estimate;
        if (cost > MAX_FILE_PROGRAM_COST) throw Error('geofile-regexp-complexity');
        if (cached === undefined) {
            try {
                RE2JS.compile(pattern);
            } catch {
                throw Error('geofile-regexp');
            }
            if (accepted.size >= MAX_CACHE_ENTRIES) accepted.delete(accepted.keys().next().value!);
            accepted.set(pattern, estimate);
        }
        seen.add(pattern);
    };
}
