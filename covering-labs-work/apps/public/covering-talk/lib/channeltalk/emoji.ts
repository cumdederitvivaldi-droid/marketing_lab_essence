// 채널톡에서 사용되는 이모지 shortcode → 유니코드 변환
// 전체 목록: https://unicode.org/emoji/charts/full-emoji-list.html

const EMOJI_MAP: Record<string, string> = {
  // 사람/얼굴
  "smile": "😄", "laughing": "😆", "blush": "😊", "smiley": "😃", "relaxed": "☺️",
  "grinning": "😀", "grin": "😁", "joy": "😂", "sweat_smile": "😅", "rofl": "🤣",
  "wink": "😉", "kissing_heart": "😘", "yum": "😋", "stuck_out_tongue": "😛",
  "stuck_out_tongue_winking_eye": "😜", "stuck_out_tongue_closed_eyes": "😝",
  "heart_eyes": "😍", "star_struck": "🤩", "thinking": "🤔", "thinking_face": "🤔",
  "raised_eyebrow": "🤨", "neutral_face": "😐", "expressionless": "😑",
  "no_mouth": "😶", "rolling_eyes": "🙄", "smirk": "😏", "persevere": "😣",
  "disappointed": "😞", "confounded": "😖", "tired_face": "😫", "weary": "😩",
  "pleading_face": "🥺", "cry": "😢", "sob": "😭", "triumph": "😤", "angry": "😠",
  "rage": "😡", "face_with_symbols_on_mouth": "🤬", "skull": "💀",
  "see_no_evil": "🙈", "hear_no_evil": "🙉", "speak_no_evil": "🙊",
  "wave": "👋", "raised_hands": "🙌", "clap": "👏", "pray": "🙏",
  "handshake": "🤝", "thumbsup": "👍", "+1": "👍", "thumbsdown": "👎", "-1": "👎",
  "ok_hand": "👌", "point_up": "☝️", "point_down": "👇", "point_left": "👈",
  "point_right": "👉", "v": "✌️", "muscle": "💪",
  "hugs": "🤗", "shushing_face": "🤫", "zipper_mouth_face": "🤐",
  "sunglasses": "😎", "nerd_face": "🤓", "monocle_face": "🧐",
  "confused": "😕", "worried": "😟", "slightly_frowning_face": "🙁",
  "frowning_face": "☹️", "open_mouth": "😮", "hushed": "😯",
  "astonished": "😲", "flushed": "😳", "scream": "😱", "fearful": "😨",
  "cold_sweat": "😰", "disappointed_relieved": "😥", "sweat": "😓",
  "sleeping": "😴", "sleepy": "😪", "dizzy_face": "😵", "mask": "😷",
  "face_with_thermometer": "🤒", "face_with_head_bandage": "🤕", "nauseated_face": "🤢",
  "sneezing_face": "🤧", "innocent": "😇", "cowboy_hat_face": "🤠",
  "clown_face": "🤡", "lying_face": "🤥", "partying_face": "🥳",
  "woozy_face": "🥴", "zany_face": "🤪", "face_vomiting": "🤮",
  "hot_face": "🥵", "cold_face": "🥶", "exploding_head": "🤯",
  "slightly_smiling_face": "🙂", "upside_down_face": "🙃",
  "kissing": "😗", "kissing_smiling_eyes": "😙", "kissing_closed_eyes": "😚",
  "money_mouth_face": "🤑", "face_with_hand_over_mouth": "🤭",

  // 사람
  "bust_in_silhouette": "👤", "busts_in_silhouette": "👥",
  "boy": "👦", "girl": "👧", "man": "👨", "woman": "👩",
  "older_man": "👴", "older_woman": "👵", "baby": "👶",
  "angel": "👼", "cop": "👮", "guardsman": "💂",
  "construction_worker": "👷", "princess": "👸", "prince": "🤴",
  "santa": "🎅", "superhero": "🦸", "supervillain": "🦹",
  "mage": "🧙", "fairy": "🧚", "vampire": "🧛",
  "person_frowning": "🙍", "person_with_pouting_face": "🙎",
  "no_good": "🙅", "ok_woman": "🙆", "information_desk_person": "💁",
  "raising_hand": "🙋", "bow": "🙇", "face_palm": "🤦", "shrug": "🤷",
  "person_doing_cartwheel": "🤸", "dancer": "💃", "man_dancing": "🕺",

  // 직업/역할 (채널톡에서 자주 사용)
  "female-technologist": "👩‍💻", "male-technologist": "👨‍💻",
  "technologist": "🧑‍💻",
  "female-office-worker": "👩‍💼", "male-office-worker": "👨‍💼",
  "female-doctor": "👩‍⚕️", "male-doctor": "👨‍⚕️",
  "female-teacher": "👩‍🏫", "male-teacher": "👨‍🏫",
  "female-scientist": "👩‍🔬", "male-scientist": "👨‍🔬",
  "female-artist": "👩‍🎨", "male-artist": "👨‍🎨",
  "female-cook": "👩‍🍳", "male-cook": "👨‍🍳",
  "female-mechanic": "👩‍🔧", "male-mechanic": "👨‍🔧",
  "female-farmer": "👩‍🌾", "male-farmer": "👨‍🌾",
  "female-firefighter": "👩‍🚒", "male-firefighter": "👨‍🚒",
  "female-pilot": "👩‍✈️", "male-pilot": "👨‍✈️",
  "female-astronaut": "👩‍🚀", "male-astronaut": "👨‍🚀",
  "female-judge": "👩‍⚖️", "male-judge": "👨‍⚖️",
  "female-student": "👩‍🎓", "male-student": "👨‍🎓",
  "female-singer": "👩‍🎤", "male-singer": "👨‍🎤",
  "female-detective": "🕵️‍♀️", "male-detective": "🕵️‍♂️",

  // 하트/감정
  "heart": "❤️", "orange_heart": "🧡", "yellow_heart": "💛",
  "green_heart": "💚", "blue_heart": "💙", "purple_heart": "💜",
  "black_heart": "🖤", "white_heart": "🤍", "brown_heart": "🤎",
  "broken_heart": "💔", "heartbeat": "💓", "heartpulse": "💗",
  "two_hearts": "💕", "revolving_hearts": "💞", "sparkling_heart": "💖",
  "cupid": "💘", "gift_heart": "💝", "heart_decoration": "💟",
  "heavy_heart_exclamation": "❣️", "love_letter": "💌",

  // 손/제스처
  "raised_hand": "✋", "hand": "✋", "vulcan_salute": "🖖",
  "open_hands": "👐", "palms_up_together": "🤲", "fist": "✊",
  "fist_raised": "✊", "fist_oncoming": "👊", "fist_left": "🤛", "fist_right": "🤜",
  "crossed_fingers": "🤞", "love_you_gesture": "🤟", "metal": "🤘",
  "call_me_hand": "🤙", "writing_hand": "✍️", "nail_care": "💅",
  "selfie": "🤳",

  // 자연/동물
  "dog": "🐶", "cat": "🐱", "mouse": "🐭", "hamster": "🐹",
  "rabbit": "🐰", "fox_face": "🦊", "bear": "🐻", "panda_face": "🐼",
  "koala": "🐨", "tiger": "🐯", "lion": "🦁", "cow": "🐮",
  "pig": "🐷", "frog": "🐸", "monkey_face": "🐵", "chicken": "🐔",
  "penguin": "🐧", "bird": "🐦", "eagle": "🦅", "owl": "🦉",
  "unicorn": "🦄", "bee": "🐝", "bug": "🐛", "butterfly": "🦋",
  "snail": "🐌", "octopus": "🐙", "turtle": "🐢", "snake": "🐍",
  "whale": "🐳", "dolphin": "🐬", "fish": "🐟", "tropical_fish": "🐠",

  // 식물
  "bouquet": "💐", "cherry_blossom": "🌸", "rose": "🌹", "sunflower": "🌻",
  "blossom": "🌼", "tulip": "🌷", "seedling": "🌱", "herb": "🌿",
  "four_leaf_clover": "🍀", "fallen_leaf": "🍂", "leaves": "🍃",
  "cactus": "🌵", "palm_tree": "🌴", "deciduous_tree": "🌳",

  // 음식
  "apple": "🍎", "banana": "🍌", "grapes": "🍇", "watermelon": "🍉",
  "strawberry": "🍓", "peach": "🍑", "pizza": "🍕", "hamburger": "🍔",
  "coffee": "☕", "beer": "🍺", "wine_glass": "🍷", "cake": "🎂",
  "ice_cream": "🍨", "cookie": "🍪", "chocolate_bar": "🍫",

  // 활동/스포츠
  "soccer": "⚽", "basketball": "🏀", "football": "🏈", "baseball": "⚾",
  "trophy": "🏆", "medal_sports": "🏅", "first_place_medal": "🥇",
  "dart": "🎯", "video_game": "🎮", "game_die": "🎲",

  // 여행/장소
  "car": "🚗", "taxi": "🚕", "bus": "🚌", "ambulance": "🚑",
  "fire_engine": "🚒", "truck": "🚚", "airplane": "✈️",
  "rocket": "🚀", "house": "🏠", "office": "🏢", "hospital": "🏥",
  "school": "🏫", "church": "⛪", "mountain": "⛰️",

  // 물건
  "phone": "📱", "telephone_receiver": "📞", "computer": "💻", "keyboard": "⌨️",
  "printer": "🖨️", "mouse_three_button": "🖱️", "cd": "💿",
  "floppy_disk": "💾", "camera": "📷", "video_camera": "📹",
  "movie_camera": "🎥", "tv": "📺", "radio": "📻",
  "bulb": "💡", "flashlight": "🔦", "wrench": "🔧", "hammer": "🔨",
  "nut_and_bolt": "🔩", "gear": "⚙️", "lock": "🔒", "unlock": "🔓",
  "key": "🔑", "mag": "🔍", "mag_right": "🔎",
  "link": "🔗", "paperclip": "📎", "scissors": "✂️",
  "package": "📦", "mailbox": "📫", "email": "📧", "envelope": "✉️",
  "memo": "📝", "pencil": "✏️", "pencil2": "✏️",
  "book": "📖", "books": "📚", "notebook": "📓",
  "calendar": "📅", "chart_with_upwards_trend": "📈", "chart_with_downwards_trend": "📉",
  "bar_chart": "📊", "clipboard": "📋", "pushpin": "📌",
  "bell": "🔔", "no_bell": "🔕", "bookmark": "🔖",
  "moneybag": "💰", "dollar": "💵", "credit_card": "💳",
  "gem": "💎", "gift": "🎁", "ribbon": "🎀",
  "tada": "🎉", "confetti_ball": "🎊", "balloon": "🎈",
  "sparkles": "✨", "sparkle": "❇️", "star": "⭐", "star2": "🌟",
  "dizzy": "💫", "boom": "💥", "fire": "🔥", "zap": "⚡",
  "snowflake": "❄️", "rainbow": "🌈", "sunny": "☀️",
  "cloud": "☁️", "umbrella": "☂️", "droplet": "💧",
  // 달/날씨/하늘
  "new_moon": "🌑", "waxing_crescent_moon": "🌒", "first_quarter_moon": "🌓",
  "waxing_gibbous_moon": "🌔", "full_moon": "🌕", "waning_gibbous_moon": "🌖",
  "last_quarter_moon": "🌗", "waning_crescent_moon": "🌘",
  "crescent_moon": "🌙", "new_moon_with_face": "🌚", "first_quarter_moon_with_face": "🌛",
  "last_quarter_moon_with_face": "🌜", "full_moon_with_face": "🌝",
  "sun_with_face": "🌞", "globe_showing_americas": "🌎", "globe_showing_europe_africa": "🌍",
  "globe_showing_asia_australia": "🌏", "earth_americas": "🌎", "earth_africa": "🌍", "earth_asia": "🌏",
  "ringed_planet": "🪐", "comet": "☄️", "milky_way": "🌌",
  "cloud_with_rain": "🌧️", "cloud_with_lightning": "🌩️", "cloud_with_snow": "🌨️",
  "tornado": "🌪️", "fog": "🌫️", "wind_face": "🌬️", "cyclone": "🌀",
  "thermometer": "🌡️", "sunrise": "🌅", "sunset": "🌇", "city_sunset": "🌆",
  "night_with_stars": "🌃", "stars": "🌠", "shooting_star": "🌠",

  // 기호
  "check": "✅", "white_check_mark": "✅", "heavy_check_mark": "✔️",
  "ballot_box_with_check": "☑️",
  "x": "❌", "negative_squared_cross_mark": "❎",
  "exclamation": "❗", "question": "❓",
  "grey_exclamation": "❕", "grey_question": "❔",
  "100": "💯", "anger": "💢", "speech_balloon": "💬",
  "thought_balloon": "💭", "zzz": "💤",
  "warning": "⚠️", "no_entry": "⛔", "no_entry_sign": "🚫",
  "o": "⭕", "heavy_plus_sign": "➕", "heavy_minus_sign": "➖",
  "heavy_multiplication_x": "✖️", "heavy_division_sign": "➗",
  "arrow_right": "➡️", "arrow_left": "⬅️", "arrow_up": "⬆️", "arrow_down": "⬇️",
  "arrows_counterclockwise": "🔄", "back": "🔙", "end": "🔚",
  "new": "🆕", "top": "🔝", "up": "🆙", "cool": "🆒", "free": "🆓",
  "ok": "🆗", "sos": "🆘", "red_circle": "🔴", "orange_circle": "🟠",
  "yellow_circle": "🟡", "green_circle": "🟢", "blue_circle": "🔵",
  "purple_circle": "🟣", "white_circle": "⚪", "black_circle": "⚫",

  // 숫자/키캡
  "zero": "0️⃣", "one": "1️⃣", "two": "2️⃣", "three": "3️⃣",
  "four": "4️⃣", "five": "5️⃣", "six": "6️⃣", "seven": "7️⃣",
  "eight": "8️⃣", "nine": "9️⃣", "ten": "🔟",
  "hash": "#️⃣", "asterisk": "*️⃣",
  "keycap_ten": "🔟",

  // 시계
  "watch": "⌚", "hourglass": "⌛", "timer_clock": "⏲️",
  "alarm_clock": "⏰", "stopwatch": "⏱️",

  // 깃발
  "flag_kr": "🇰🇷", "flag_us": "🇺🇸", "flag_jp": "🇯🇵", "flag_cn": "🇨🇳",
  "checkered_flag": "🏁", "white_flag": "🏳️", "black_flag": "🏴",

  // 기타 자주 쓰이는 것
  "eyes": "👀", "eye": "👁️", "tongue": "👅", "lips": "👄",
  "brain": "🧠", "bone": "🦴", "tooth": "🦷",
  "ear": "👂", "nose": "👃", "footprints": "👣",
  "ring": "💍", "lipstick": "💄", "dress": "👗",
  "tshirt": "👕", "jeans": "👖", "necktie": "👔",
  "crown": "👑", "tophat": "🎩", "mortar_board": "🎓",
  "ghost": "👻", "alien": "👽", "robot": "🤖",
  "jack_o_lantern": "🎃", "christmas_tree": "🎄",
  "poop": "💩", "hankey": "💩",
  "middle_finger": "🖕", "the_horns": "🤘",
  // 직업/사람 (성별 변형 포함)
  "man_technologist": "👨‍💻", "woman_technologist": "👩‍💻",
  "male_technologist": "👨‍💻", "female_technologist": "👩‍💻",
  "man_office_worker": "👨‍💼", "woman_office_worker": "👩‍💼",
  "male_office_worker": "👨‍💼", "female_office_worker": "👩‍💼",
  "man_mechanic": "👨‍🔧", "woman_mechanic": "👩‍🔧",
  "man_cook": "👨‍🍳", "woman_cook": "👩‍🍳",
  "man_farmer": "👨‍🌾", "woman_farmer": "👩‍🌾",
  "man_teacher": "👨‍🏫", "woman_teacher": "👩‍🏫",
  "man_student": "👨‍🎓", "woman_student": "👩‍🎓",
  "man_artist": "👨‍🎨", "woman_artist": "👩‍🎨",
  "man_firefighter": "👨‍🚒", "woman_firefighter": "👩‍🚒",
  "man_pilot": "👨‍✈️", "woman_pilot": "👩‍✈️",
  "man_astronaut": "👨‍🚀", "woman_astronaut": "👩‍🚀",
  "man_judge": "👨‍⚖️", "woman_judge": "👩‍⚖️",
  "man_health_worker": "👨‍⚕️", "woman_health_worker": "👩‍⚕️",
  "merperson": "🧜", "elf": "🧝", "genie": "🧞",
  "person_pouting": "🙎", "person_gesturing_no": "🙅",
  "person_gesturing_ok": "🙆", "person_tipping_hand": "💁", "person_raising_hand": "🙋",
  "person_bowing": "🙇", "person_facepalming": "🤦", "person_shrugging": "🤷",
  // 건물/장소 (기존에 없는 것만)
  "store": "🏪", "hotel": "🏨", "bank": "🏦", "factory": "🏭",
  "apartment": "🏢", "post_office": "🏣",
  // 교통 (기존에 없는 것만)
  "police_car": "🚓", "motorcycle": "🏍️", "bicycle": "🚲",
  "ship": "🚢", "helicopter": "🚁",
  // 음식 (기존에 없는 것만)
  "fries": "🍟", "hotdog": "🌭", "popcorn": "🍿", "doughnut": "🍩",
  "tea": "🍵", "cocktail": "🍸", "tropical_drink": "🍹",
  // 스포츠 (기존에 없는 것만)
  "tennis": "🎾", "volleyball": "🏐", "golf": "⛳",
  "medal": "🏅", "2nd_place_medal": "🥈", "3rd_place_medal": "🥉",
};

/**
 * 채널톡 이모지 shortcode (:name:) → 유니코드 이모지 변환
 */
export function convertEmojiShortcodes(text: string): string {
  return text.replace(/:([a-zA-Z0-9_+-]+):/g, (match, code) => {
    return EMOJI_MAP[code] ?? match;
  });
}
