const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const fileUpload = require("express-fileupload");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connecté à MongoDB"))
  .catch((error) => console.error("Erreur de connexion à MongoDB:", error));

// Modèle Mongoose
const locationSchema = new mongoose.Schema({
  locationName: { type: String, required: true },
  locationAddress: { type: String, required: true },
  locationDescription: { type: String, required: true },
  tips: String,
  socialmedia: String,
  mediaLink: Object,
  hours: Object,
  priceRange: String,
  keywords: [String],
  filters: [String],
  postalCode: String,
  placeCategory: String,
  photos: [String], // URLs des photos stockées
});

const Location = mongoose.model("Location", locationSchema);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const convertToBase64 = (file) => {
  return `data:${file.mimetype};base64,${file.data.toString("base64")}`;
};

// Point de terminaison pour enregistrer les informations
app.post("/location", async (req, res) => {
  try {
    const {
      locationName,
      locationAddress,
      locationDescription,
      tips,
      socialmedia,
      mediaLink,
      hours,
      priceRange,
      keywords,
      filters,
      postalCode,
      placeCategory,
    } = req.body;

    // Conversion JSON des champs mediaLink, hours, keywords, et filters s'ils sont envoyés sous forme de chaîne
    const parsedMediaLink =
      typeof mediaLink === "string" ? JSON.parse(mediaLink) : mediaLink;
    const parsedHours = typeof hours === "string" ? JSON.parse(hours) : hours;
    const parsedKeywords =
      typeof keywords === "string" ? JSON.parse(keywords) : keywords;
    const parsedFilters =
      typeof filters === "string" ? JSON.parse(filters) : filters;

    const extractHref = (htmlString) => {
      const hrefRegex = /href=["']([^"']+)["']/;
      const match = htmlString.match(hrefRegex);
      return match ? match[1] : null;
    };

    // Appliquer extractHref à chaque élément de mediaLink s'il s'agit d'un tableau
    const processedMediaLink = Array.isArray(parsedMediaLink)
      ? parsedMediaLink.map((link) => extractHref(link))
      : parsedMediaLink;

    const newLocation = new Location({
      locationName,
      locationAddress,
      locationDescription,
      tips,
      socialmedia,
      mediaLink: processedMediaLink,
      hours: parsedHours,
      priceRange,
      keywords: parsedKeywords,
      filters: parsedFilters,
      postalCode,
      placeCategory,
    });

    // Gestion des fichiers photos
    console.log("req.files>>>>>", req.files);
    if (req.files && req.files.photos) {
      console.log("les photos>>>>", req.files.photos);
      const photoFiles = Array.isArray(req.files.photos)
        ? req.files.photos
        : [req.files.photos];
      newLocation.photos = [];

      for (const photo of photoFiles) {
        const convertedPhoto = convertToBase64(photo);
        try {
          const uploadResult = await cloudinary.uploader.upload(convertedPhoto);
          newLocation.photos.push(uploadResult.secure_url);
        } catch (uploadError) {
          console.error("Erreur lors de l'upload Cloudinary:", uploadError);
          return res
            .status(500)
            .json({ error: "Échec de l'upload des photos." });
        }
      }
    }

    await newLocation.save();
    res.status(201).json({ message: "Données enregistrées avec succès !" });
  } catch (error) {
    console.error("Erreur lors de l'enregistrement des données:", error);
    res.status(500).json({
      error: "Une erreur est survenue lors de l'enregistrement des données.",
      details: error.message,
    });
  }
});

// Route GET pour récupérer toutes les locations
app.get("/items", async (req, res) => {
  try {
    const locations = await Location.find();
    res.status(200).json(locations);
  } catch (error) {
    console.error("Erreur lors de la récupération des données:", error);
    res.status(500).json({
      error: "Une erreur est survenue lors de la récupération des données.",
      details: error.message,
    });
  }
});

// Route GET pour récupérer une location par _id
app.get("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const location = await Location.findById(id);

    if (!location) {
      return res.status(404).json({ error: "Location non trouvée." });
    }

    res.status(200).json(location);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'élément:", error);
    res.status(500).json({
      error: "Une erreur est survenue lors de la récupération de l'élément.",
      details: error.message,
    });
  }
});

// Route PUT pour éditer une location et ajouter des photos
app.put("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedFields = req.body;

    // Récupérer l'élément existant
    const location = await Location.findById(id);
    if (!location) {
      return res.status(404).json({ error: "Location non trouvée." });
    }

    // Gestion des fichiers photos
    if (req.files && req.files.photos) {
      const photoFiles = Array.isArray(req.files.photos)
        ? req.files.photos
        : [req.files.photos];

      for (const photo of photoFiles) {
        const convertedPhoto = convertToBase64(photo);
        try {
          // Upload sur Cloudinary
          const uploadResult = await cloudinary.uploader.upload(convertedPhoto);
          // Ajouter l'URL de la photo à la liste des photos existantes
          location.photos.push(uploadResult.secure_url);
        } catch (uploadError) {
          console.error("Erreur lors de l'upload Cloudinary:", uploadError);
          return res
            .status(500)
            .json({ error: "Échec de l'upload des photos." });
        }
      }
    }

    // Mise à jour des autres champs si fournis
    Object.assign(location, updatedFields);

    // Sauvegarder les modifications
    await location.save();
    res.status(200).json({
      message: "Location mise à jour avec succès.",
      location,
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la location:", error);
    res.status(500).json({
      error: "Une erreur est survenue lors de la mise à jour.",
      details: error.message,
    });
  }
});

// Route DELETE pour supprimer une photo spécifique
app.delete("/items/:id/photo", async (req, res) => {
  try {
    const { id } = req.params;
    const { photoUrl } = req.body; // URL de la photo à supprimer

    // Récupérer la location par son _id
    const location = await Location.findById(id);
    if (!location) {
      return res.status(404).json({ error: "Location non trouvée." });
    }

    // Vérifier si la photo existe dans la liste des photos
    const photoIndex = location.photos.indexOf(photoUrl);
    if (photoIndex === -1) {
      return res.status(404).json({ error: "Photo non trouvée." });
    }

    // Supprimer la photo de Cloudinary
    const publicId = photoUrl.split("/").pop().split(".")[0]; // Extraire le public_id
    await cloudinary.uploader.destroy(publicId);

    // Supprimer la photo de la liste
    location.photos.splice(photoIndex, 1);

    // Sauvegarder les modifications
    await location.save();

    res.status(200).json({
      message: "Photo supprimée avec succès.",
      photos: location.photos,
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la photo:", error);
    res.status(500).json({
      error: "Une erreur est survenue lors de la suppression de la photo.",
      details: error.message,
    });
  }
});

app.get("/drink", async (req, res) => {
  try {
    const { postalCode, keywords, priceRange, filters } = req.query;

    // Recherche initiale pour placeCategory === "prendre_un_verre"
    const baseFilter = { placeCategory: "prendre_un_verre" };

    // Ajout des autres filtres dynamiques
    if (postalCode) baseFilter.postalCode = postalCode;
    if (keywords) baseFilter.keywords = { $in: keywords.split(",") };
    if (priceRange) baseFilter.priceRange = priceRange;
    if (filters) {
      // Convertir la chaîne de filtres en tableau
      const filterArray = filters.split(","); // Exemple : "Décoration:Cosy,Ambiance:Branchée"
      baseFilter.filters = { $all: filterArray }; // Tous les filtres doivent être présents
    }

    // Recherche avec les filtres combinés
    const locations = await Location.find(baseFilter);

    if (locations.length === 0) {
      return res
        .status(404)
        .json({ message: "Aucun lieu trouvé avec ces critères." });
    }

    res.status(200).json(locations);
  } catch (error) {
    console.error(
      "Erreur lors de la récupération et du filtrage des données :",
      error
    );
    res.status(500).json({
      error: "Une erreur est survenue lors de la récupération et du filtrage.",
      details: error.message,
    });
  }
});

// Route GET pour récupérer les locations avec placeCategory === "manger_ensemble"
app.get("/eat", async (req, res) => {
  try {
    // Recherche dans la base de données
    const locations = await Location.find({
      placeCategory: "manger_ensemble",
    });
    res.status(200).json(locations);
  } catch (error) {
    console.error("Erreur lors de la récupération des données:", error);
    res.status(500).json({
      error: "Une erreur est survenue lors de la récupération des données.",
      details: error.message,
    });
  }
});

// Route GET pour récupérer les locations avec placeCategory === "partager_une_activité"
app.get("/fun", async (req, res) => {
  try {
    // Recherche dans la base de données
    const locations = await Location.find({
      placeCategory: "partager_une_activité",
    });
    res.status(200).json(locations);
  } catch (error) {
    console.error("Erreur lors de la récupération des données:", error);
    res.status(500).json({
      error: "Une erreur est survenue lors de la récupération des données.",
      details: error.message,
    });
  }
});

// Route GET pour filtrer et afficher les catégories
app.get("/filterCategories", async (req, res) => {
  try {
    const { placeCategory, postalCode, keywords, priceRange, filters } =
      req.query;

    // Construction du filtre dynamique
    const selecFilters = {};
    if (placeCategory) selecFilters.placeCategory = placeCategory;
    if (postalCode) selecFilters.postalCode = postalCode;
    if (keywords) selecFilters.keywords = { $in: keywords.split(",") }; // Recherche parmi les mots-clés
    if (priceRange) selecFilters.priceRange = priceRange;
    if (filters) {
      // Convertir la chaîne des filtres en tableau et rechercher les correspondances dans le tableau "filters" des documents
      const filterArray = filters.split(","); // Exemple : "Décoration:Cosy,Ambiance:Branchée"
      selecFilters.filters = { $all: filterArray }; // Tous les filtres doivent être présents
    }

    // Recherche dans la base de données
    const locations = await Location.find(selecFilters);

    if (locations.length === 0) {
      return res
        .status(404)
        .json({ message: "Aucun lieu trouvé avec ces critères." });
    }

    res.status(200).json(locations);
  } catch (error) {
    console.error("Erreur lors du filtrage des catégories :", error);
    res.status(500).json({
      error: "Une erreur est survenue lors du filtrage des catégories.",
      details: error.message,
    });
  }
});

// -------------------- TROUVER ADRESSE A PROXIMITE -----------------------

app.get("/filter-nearby", async (req, res) => {
  try {
    const { address, maxDistance, placeCategory, typeOfSeason } = req.query; // Utilisation de req.query au lieu de req.body

    if (!address) {
      return res.status(400).json({ error: "Adresse manquante." });
    }

    if (!placeCategory) {
      return res.status(400).json({ error: "placeCategory manquant." });
    }

    // Fonction pour géocoder une adresse
    async function geocodeAddress(address) {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json`,
        {
          params: {
            address: address,
            key: apiKey,
          },
        }
      );
      if (!response.data.results || response.data.results.length === 0) {
        throw new Error("Adresse introuvable.");
      }
      return response.data.results[0].geometry.location; // { lat, lng }
    }

    // Calcul de la distance (formule Haversine)
    function haversineDistance(lat1, lon1, lat2, lon2) {
      const toRadians = (deg) => (deg * Math.PI) / 180;
      const R = 6371; // Rayon de la Terre en km
      const dLat = toRadians(lat2 - lat1);
      const dLon = toRadians(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
          Math.cos(toRadians(lat2)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    // Géocodez l'adresse de l'utilisateur
    const { lat: userLat, lng: userLng } = await geocodeAddress(address);

    const selecFilters = {};
    if (placeCategory) selecFilters.placeCategory = placeCategory;
    // if (typeOfSeason) {
    //   // Convertir la chaîne des filtres en tableau et rechercher les correspondances dans le tableau "filters" des documents
    //   selecFilters.typeOfSeason = {
    //     filters: {
    //       $elemMatch: { $regex: `/^Type d’espace:${typeOfSeason}$/` },
    //     },
    //   };
    // }

    // Passez selecFilters directement sans envelopper
    const locations = await Location.find(selecFilters);
    console.log("locations", locations);
    console.log("selecFilters", selecFilters);
    console.log("typeOfSeason", typeOfSeason);

    // Géocodez chaque adresse et calculez la distance
    const nearbyLocations = [];
    for (const location of locations) {
      try {
        const { lat, lng } = await geocodeAddress(location.locationAddress);
        const distance = haversineDistance(userLat, userLng, lat, lng);

        if (distance <= maxDistance) {
          nearbyLocations.push({
            ...location.toObject(),
            distance,
            latitude: lat,
            longitude: lng,
          });
        }
      } catch (err) {
        console.error(
          `Erreur lors du géocodage de l'adresse ${location.locationAddress}:`,
          err.message
        );
      }
    }

    // Trier les emplacements par ordre croissant de distance
    nearbyLocations.sort((a, b) => a.distance - b.distance);

    // Retourner les emplacements filtrés et triés
    res.status(200).json(nearbyLocations);
  } catch (err) {
    console.error("Erreur lors du filtrage des emplacements :", err.message);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT} 🚀🚀🚀`);
});
