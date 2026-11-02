import { redirect } from "next/navigation";

// /editions/nouvelle était une URL morte : aucun lien dans l'application n'y
// pointe et l'id « nouvelle » n'existe pas en base (l'API répondait une erreur
// de cast UUID à la page de détail). Redirection canonique vers le formulaire
// de création dédié (mission FRONT-16).

export default function RedirectionNouvelleEdition() {
  redirect("/editions/nouvelle/edit");
}
