/**
 * Built-in secret words for the Imposter game, grouped by category.
 * Everyone sees the category; only the non-imposters see the word.
 * Words are school-friendly and well known to young players.
 */
export const IMPOSTER_WORDS = {
  Animals: ["elephant", "penguin", "giraffe", "dolphin", "kangaroo", "octopus", "lion", "owl", "snake", "rabbit", "shark", "butterfly", "camel", "panda", "horse"],
  Food: ["pizza", "banana", "chocolate", "pancake", "sushi", "popcorn", "spaghetti", "apple", "sandwich", "ice cream", "carrot", "cheese", "soup", "bread", "strawberry"],
  School: ["blackboard", "calculator", "backpack", "pencil", "library", "homework", "teacher", "ruler", "eraser", "timetable", "microscope", "notebook", "playground", "exam", "glue"],
  Places: ["beach", "airport", "hospital", "museum", "castle", "desert", "supermarket", "volcano", "zoo", "cinema", "farm", "island", "train station", "jungle", "stadium"],
  Sports: ["football", "tennis", "swimming", "basketball", "skiing", "boxing", "cycling", "volleyball", "karate", "golf", "surfing", "running", "chess", "skateboarding", "rugby"],
  Jobs: ["firefighter", "doctor", "pilot", "chef", "farmer", "astronaut", "police officer", "dentist", "baker", "artist", "mechanic", "nurse", "scientist", "photographer", "builder"],
  "At home": ["sofa", "fridge", "toothbrush", "pillow", "lamp", "mirror", "oven", "bathtub", "television", "clock", "umbrella", "blanket", "washing machine", "doorbell", "staircase"],
  Nature: ["rainbow", "thunderstorm", "mountain", "river", "snowflake", "forest", "waterfall", "sunflower", "moon", "cloud", "earthquake", "cactus", "ocean", "tornado", "leaf"],
};

export const IMPOSTER_CATEGORIES = Object.keys(IMPOSTER_WORDS);
