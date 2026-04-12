from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score


def em():

    texts = [
        ["I am happy","This is amazing and fun","I feel great today","I am joking with you",
         "What a wonderful day","That's funny","You are hilarious","LOL","I'm laughing so hard"],

        ["I am sad","This is terrible","I am depressed","I feel down","I am unhappy",
         "Everything is awful","I want to cry","I feel lonely","It hurts so much"],

        ["I am very angry","This makes me furious","I am angry","I hate this","That's annoying",
         "I am frustrated","I can't stand this","You made me mad","I'm pissed off"],

        ["I am surprised by the news","Wow, I didn't expect that!","I can't believe it",
         "No way!","That's shocking","What just happened?","You surprised me!",
         "Wow","Unbelievable","Really?","Oh my god"],

        ["It's okay, I don't care","I am okay","Not bad","So-so","It's an average day",
         "Just another day","Everything is okay","Nothing special happened",
         "Okay","Fine","Normal","alright"],

        ["I am scared","This is terrifying","I feel afraid","That's scary","Help me",
         "I'm in danger","I'm anxious","I'm nervous","I'm shaking","This is dangerous",
         "I heard something weird","I think someone is following me",
         "I can't breathe","I'm panicking"],

        ["I want to kill","I will destroy everything","Revenge is mine","Pain and suffering",
         "I hate them","Torture is fun","Blood everywhere","Murder is inevitable","I am evil"],

        ["I feel relaxed","Everything is peaceful","I am calm","The environment is serene",
         "Just chilling","Soothing music","I feel comfortable"],

        ["I am the best","No one can beat me","I'm perfect","Everyone admires me",
         "I'm better than all of them","I'm unstoppable",
         "I am so proud of myself","They all look up to me",
         "I always win","I am amazing"],

        ["I love you","I adore you","I care for you","I feel in love",
         "I am fond of you","Love is all around",
         "My heart is yours","You are amazing"],

        ["I am bored","Nothing to do","I feel sleepy","This is dull",
         "I am tired of this","So bored",
         "I feel uninterested","This is boring"],
        ["I feel normal","Just a regular day","Nothing unusual","Everything is fine","Life is normal","Hi my name"]
    ]

    labels = (
        ["happy"]*9 + ["sad"]*9 + ["angry"]*9 + ["surprised"]*11 +
        ["neutral"]*12 + ["scared"]*14 + ["evil"]*9 + ["calm"]*7 +
        ["pride"]*10 + ["love"]*8 + ["bored"]*8 + ["normal"]*6
    )

    texts_flat = [t.lower() for group in texts for t in group]

    X_train, X_test, y_train, y_test = train_test_split(
        texts_flat, labels, test_size=0.2, random_state=42
    )

    vectorizer = TfidfVectorizer(ngram_range=(1,2))
    X_train = vectorizer.fit_transform(X_train)
    X_test = vectorizer.transform(X_test)

    le = LabelEncoder()
    y_train = le.fit_transform(y_train)
    y_test = le.transform(y_test)

    model = LogisticRegression(max_iter=500)
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    print("Model Accuracy:", accuracy_score(y_test, preds))

    emoji_map = {
        "happy": "😊","sad": "😢","angry": "😡","surprised": "😮",
        "neutral": "😐","scared":"😨","evil":"😈","calm":"😌",
        "pride":"😎","love":"💖","bored":"😴","normal": "🙂"
    }

    while True:
        user_input = input("\nEnter a sentence (or 'exit'): ").lower()
        if user_input == "exit":
            break

        x_input = vectorizer.transform([user_input])
        pred = model.predict(x_input)[0]
        emotion = le.inverse_transform([pred])[0]

        print(f"Detected emotion: {emotion.upper()} {emoji_map[emotion]}")

em()

