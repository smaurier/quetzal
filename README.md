# Quetzal 🦜

![NestJS](https://img.shields.io/badge/-NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white)
![Next.js](https://img.shields.io/badge/-Next.js-000000?style=flat-square&logo=next.js&logoColor=white)
![Socket.io](https://img.shields.io/badge/-Socket.io-010101?style=flat-square&logo=socket.io&logoColor=white)

## 🚀 Présentation

Quetzal est une plateforme éducative interactive inspirée de Kahoot!, permettant de créer et d'animer des **quiz et mini-jeux pédagogiques** en temps réel.
Elle est pensée pour être utilisée par des enseignants et formateurs.

## 🏗️ Stack technique

- **Frontend** : Next.js (React)
- **Backend** : NestJS (Node.js) + Socket.io pour le temps réel
- **Monorepo** : Gestion avec pnpm

## 📂 Structure du projet

```
quetzal/
│── quetzal-frontend/   # Frontend en Next.js
│── quetzal-backend/    # Backend en NestJS
│── .gitignore          # Fichiers ignorés par Git
│── package.json        # Configuration des dépendances globales
│── pnpm-workspace.yaml # Configuration du monorepo
│── README.md           # Documentation du projet
```

## 🚀 Installation & démarrage

### 1️⃣ Prérequis

- **Node.js** (>= 18)
- **pnpm** installé globalement :
  ```bash
  npm install -g pnpm
  ```

### 2️⃣ Installation des dépendances

```bash
pnpm install
```

### 3️⃣ Lancer le projet en local

Démarrer à la fois le **frontend** et le **backend** avec une seule commande :

```bash
pnpm dev
```

Ou les exécuter séparément :

```bash
pnpm dev:frontend  # Démarrer Next.js
pnpm dev:backend   # Démarrer NestJS
```

## 📌 Commandes utiles

| Commande            | Description                       |
| ------------------- | --------------------------------- |
| `pnpm install`      | Installe les dépendances          |
| `pnpm dev`          | Démarre le frontend et le backend |
| `pnpm dev:frontend` | Lance uniquement le frontend      |
| `pnpm dev:backend`  | Lance uniquement le backend       |
| `pnpm build`        | Build du projet complet           |
| `pnpm lint`         | Vérifie le code                   |

## 🎯 Roadmap

✅ **MVP** : Développer un premier prototype avec une interface simple.  
🛠 **V2** : Ajouter des types de jeux interactifs en plus des quiz.  
🌍 **V3** : Internationalisation et amélioration UX.

---

**⚡ Contact & Contributeurs**  
Développé par [@smaurier](https://github.com/smaurier) 💡
