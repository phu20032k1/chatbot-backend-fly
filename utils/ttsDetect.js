// Lightweight, dependency-free language detection for TTS routing.
// Goal: choose a reasonable Google Cloud TTS voice automatically without any UI dropdown.
// Supported (primary): Vietnamese, English, Chinese (Mandarin), Korean, Japanese.

function countMatches(str, re) {
  const m = str.match(re);
  return m ? m.length : 0;
}

function getEnvVoice(key, fallback) {
  const v = String(process.env[key] || "").trim();
  return v || fallback;
}

function normalizeText(input) {
  return String(input || "")
    // remove code blocks & inline code to reduce mis-detection
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[0-9_]+/g, " ")
    .trim();
}

function detectTtsVoice(text) {
  const t = normalizeText(text);
  if (!t) {
    return {
      languageCode: "vi-VN",
      voiceName: getEnvVoice("TTS_VOICE_VI", "vi-VN-Standard-A")
    };
  }

  // --- Script detectors (Unicode ranges) ---
  const hangul = countMatches(t, /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/g); // Korean
  const hiragana = countMatches(t, /[\u3040-\u309F]/g);
  const katakana = countMatches(t, /[\u30A0-\u30FF]/g);
  const kana = hiragana + katakana; // Japanese
  const han = countMatches(t, /[\u4E00-\u9FFF\u3400-\u4DBF]/g); // CJK Unified Ideographs

  // Vietnamese-specific letters/diacritics.
  // Includes: đ/Đ and a common set of precomposed accented letters.
  const viDiacritics = countMatches(
    t,
    /[đĐăĂâÂêÊôÔơƠưƯáàảãạÁÀẢÃẠấầẩẫậẤẦẨẪẬắằẳẵặẮẰẲẴẶéèẻẽẹÉÈẺẼẸếềểễệẾỀỂỄỆíìỉĩịÍÌỈĨỊóòỏõọÓÒỎÕỌốồổỗộỐỒỔỖỘớờởỡợỚỜỞỠỢúùủũụÚÙỦŨỤứừửữựỨỪỬỮỰýỳỷỹỵÝỲỶỸỴ]/g
  );

  // Basic latin letters count (for EN/VN without diacritics)
  const latin = countMatches(t, /[A-Za-z]/g);

  // --- Decision rules ---
  // 1) Korean if any Hangul present (very reliable)
  if (hangul > 0) {
    return {
      languageCode: "ko-KR",
      voiceName: getEnvVoice("TTS_VOICE_KO", "ko-KR-Standard-A")
    };
  }

  // 2) Japanese if any Kana present (very reliable)
  if (kana > 0) {
    return {
      languageCode: "ja-JP",
      voiceName: getEnvVoice("TTS_VOICE_JA", "ja-JP-Standard-A")
    };
  }

  // 3) Chinese if Han characters present (and not Japanese/Korean)
  if (han > 0) {
    return {
      languageCode: "cmn-CN",
      voiceName: getEnvVoice("TTS_VOICE_ZH", "cmn-CN-Standard-A")
    };
  }

  // 4) Vietnamese if diacritics present
  if (viDiacritics > 0) {
    return {
      languageCode: "vi-VN",
      voiceName: getEnvVoice("TTS_VOICE_VI", "vi-VN-Standard-A")
    };
  }

  // 5) Vietnamese heuristic without diacritics (common in informal typing)
  // Conservative: require multiple hits.
  const lower = t.toLowerCase();
  const viWordHits = [
    "khong",
    "không",
    "toi",
    "tôi",
    "ban",
    "bạn",
    "minh",
    "mình",
    "chung",
    "chúng",
    "ta",
    "là",
    "la",
    "va",
    "và",
    "cua",
    "của",
    "cho",
    "trong",
    "nhung",
    "nhưng",
    "neu",
    "nếu",
    "duoc",
    "được"
  ].reduce((acc, w) => {
    const re = new RegExp(`\\b${w}\\b`, "g");
    return acc + countMatches(lower, re);
  }, 0);

  // If text looks mostly latin and has several Vietnamese function words, assume Vietnamese.
  if (latin > 0 && viWordHits >= 3) {
    return {
      languageCode: "vi-VN",
      voiceName: getEnvVoice("TTS_VOICE_VI", "vi-VN-Standard-A")
    };
  }

  // 6) Default to English
  return {
    languageCode: "en-US",
    voiceName: getEnvVoice("TTS_VOICE_EN", "en-US-Standard-C")
  };
}

module.exports = {
  detectTtsVoice
};
