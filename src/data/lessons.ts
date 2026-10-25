export type TopicKey = "animals" | "colors" | "food";

export interface Question {
  q: string;
  es: string;
  options: string[];
  answer: number;
}

export interface Lesson {
  label: string;
  videoId: string;
  prompt: string;
  subs: [string, string][];
  questions: Question[];
  phrases: string[];
}

export const LESSONS: Record<TopicKey, Lesson> = {
  animals: {
    label: "Animales",
    videoId: "owPYJLG-5ZQ",
    prompt: "Escribe 1 o 2 frases sobre tu animal favorito.",
    subs: [
      ["The dog says woof!", "¡El perro dice guau!"],
      ["The cat likes to sleep.", "Al gato le gusta dormir."],
      ["Elephants are very big.", "Los elefantes son muy grandes."],
      ["Birds can fly in the sky.", "Los pájaros pueden volar en el cielo."],
    ],
    questions: [
      { q: "What does the dog say?", es: "¿Qué dice el perro?", options: ["Meow", "Woof", "Moo"], answer: 1 },
      { q: "Which animal is very big?", es: "¿Qué animal es muy grande?", options: ["Elephant", "Mouse", "Bird"], answer: 0 },
      { q: "What can birds do?", es: "¿Qué pueden hacer los pájaros?", options: ["Swim", "Fly", "Read"], answer: 1 },
    ],
    phrases: ["The dog says woof", "I like cats", "Elephants are very big", "Birds can fly"],
  },
  colors: {
    label: "Colores",
    videoId: "tRNy2i75tCc",
    prompt: "Escribe qué color te gusta más y por qué.",
    subs: [
      ["The sky is blue.", "El cielo es azul."],
      ["The grass is green.", "El pasto es verde."],
      ["An apple can be red.", "Una manzana puede ser roja."],
      ["The sun is yellow.", "El sol es amarillo."],
    ],
    questions: [
      { q: "What color is the sky?", es: "¿De qué color es el cielo?", options: ["Blue", "Red", "Pink"], answer: 0 },
      { q: "What color is the grass?", es: "¿De qué color es el pasto?", options: ["Purple", "Green", "Black"], answer: 1 },
      { q: "What color is the sun?", es: "¿De qué color es el sol?", options: ["Yellow", "Brown", "Blue"], answer: 0 },
    ],
    phrases: ["The sky is blue", "My favorite color is green", "The sun is yellow", "I have a red apple"],
  },
  food: {
    label: "Comida",
    videoId: "mfReSbQ7jzE",
    prompt: "Escribe qué te gusta comer en el desayuno.",
    subs: [
      ["I like to eat apples.", "Me gusta comer manzanas."],
      ["Pizza is delicious!", "¡La pizza es deliciosa!"],
      ["I drink milk every morning.", "Tomo leche cada mañana."],
      ["Bananas are yellow.", "Los plátanos son amarillos."],
    ],
    questions: [
      { q: "What do I drink every morning?", es: "¿Qué tomo cada mañana?", options: ["Juice", "Milk", "Soda"], answer: 1 },
      { q: "Which food is delicious?", es: "¿Qué comida es deliciosa?", options: ["Pizza", "Rocks", "Paper"], answer: 0 },
      { q: "What color are bananas?", es: "¿De qué color son los plátanos?", options: ["Blue", "Green", "Yellow"], answer: 2 },
    ],
    phrases: ["I like to eat apples", "Pizza is delicious", "I drink milk", "Bananas are yellow"],
  },
};

export const TOPIC_ICONS: Record<TopicKey, string> = {
  animals: "🐶 Animales",
  colors: "🌈 Colores",
  food: "🍎 Comida",
};
