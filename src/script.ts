const clientId = "394c64154935470d91d98e66e9791d25";
const params = new URLSearchParams(window.location.search);
const code = params.get("code");
const searchButton = document.getElementById("searchButton");
// Treat the search field as an input so its current value is available on click.
const searchBar = document.getElementById("searchBar") as HTMLInputElement | null;

// Distinguishes an expired or already-used OAuth code from other token request failures.
class InvalidAuthorizationCodeError extends Error {}

// if (code === null || !code && !localStorage.getItem("access_token")) {
//     redirectToAuthCodeFlow(clientId);
// } else {
//     const token = localStorage.getItem("access_token");
//     if(token !== null){
//         const profile = await fetchProfile(token);
//         populateUI(profile);
//     } else {
//         const accessToken = await getAccessToken(clientId, code);
//         localStorage.setItem("access_token", accessToken);
//         const profile = await fetchProfile(accessToken);
//         populateUI(profile);
//     }
// }

if (code !== null) {
    // Authorization codes are single-use; remove it so a refresh uses the saved token.
    const callbackUrl = new URL(window.location.href);
    callbackUrl.searchParams.delete("code");
    // The OAuth state is also no longer needed after returning from the callback.
    callbackUrl.searchParams.delete("state");
    // Update the address bar without reloading the page.
    window.history.replaceState({}, document.title, callbackUrl);

    try {
        const accessToken = await getAccessToken(clientId, code);
        localStorage.setItem("access_token", accessToken);
        // The verifier is only needed to exchange this authorization code.
        localStorage.removeItem("verifier");

        const profile = await fetchProfile(accessToken);
        populateUI(profile);
        await populateFollowedArtists(accessToken);
    } catch (error) {
        if (error instanceof InvalidAuthorizationCodeError) {
            // Discard the failed login attempt before starting a fresh authorization flow.
            localStorage.removeItem("verifier");
            localStorage.removeItem("access_token");
            localStorage.removeItem("expires_at");
            await redirectToAuthCodeFlow(clientId);
        } else {
            throw error;
        }
    }
} else {
    const token = localStorage.getItem("access_token");
    const expiry = localStorage.getItem("expires_at");
    if (token === null) {
        await redirectToAuthCodeFlow(clientId);
    } else if (
        expiry === null ||
        !Number.isFinite(Number(expiry)) ||
        checkTokenExpiration(Number(expiry))
    ) {
        await redirectToAuthCodeFlow(clientId);
    } else {
        const profile = await fetchProfile(token);
        populateUI(profile);
        await populateFollowedArtists(token);
    }
}

if (searchButton) {
    searchButton.addEventListener("click", async () => {
        // Read the latest input value when the user clicks, not when the page loads.
        const query = searchBar?.value.trim();
        if (!query) {
            return;
        }

        const token = localStorage.getItem("access_token");
        if (token === null) {
            await redirectToAuthCodeFlow(clientId);
            return;
        }

        try {
            // Pass the entered query and saved access token to the Spotify search.
            await populateSearchedSongs(token, query);
        } catch (error) {
            console.error("Song search failed:", error);
        }
    });
}





// if (code !== null) {
//     const accessToken = await getAccessToken(clientId, code);
//     localStorage.setItem("access_token", accessToken);

//     const callbackUrl = new URL(window.location.href);
//     callbackUrl.searchParams.delete("code");
//     callbackUrl.searchParams.delete("state");
//     window.history.replaceState({}, document.title, callbackUrl);

//     const profile = await fetchProfile(accessToken);
//     populateUI(profile);
// } else {
//     const token = localStorage.getItem("access_token");
//     if (token === null) {
//         await redirectToAuthCodeFlow(clientId);
//     } else {
//         const profile = await fetchProfile(token);
//         populateUI(profile);
//     }
// }

/*---------------------------------------------------------------------------*/

function checkTokenExpiration(expiresAt: number): boolean {
    return Date.now() >= expiresAt;
}

/*---------------------------------------------------------------------------*/
export async function redirectToAuthCodeFlow(clientId: string) {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://127.0.0.1:5173/callback");
    params.append("scope", "user-read-private user-read-email user-follow-read");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function generateCodeVerifier(length: number) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier: string) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
/*------------------------------------------------------------------------------*/

export async function getAccessToken(clientId: string, code: string): Promise<string> {
    const verifier = localStorage.getItem("verifier");
    if (verifier === null) {
        throw new Error("Spotify PKCE code verifier is missing. Restart the login flow.");
    }

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://127.0.0.1:5173/callback");
    params.append("code_verifier", verifier);

    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });

    const response = await result.json();
    if (!result.ok) {
        if (response.error === "invalid_grant") {
            // Spotify uses invalid_grant when an authorization code is expired or already exchanged.
            throw new InvalidAuthorizationCodeError(
                "Spotify authorization code is invalid or expired."
            );
        }
        throw new Error(
            `Spotify token request failed (${result.status}): ${response.error_description ?? response.error ?? result.statusText}`
        );
    }
    if (typeof response.access_token !== "string" || response.access_token.length === 0) {
        throw new Error("Spotify token response did not contain an access_token.");
    }
    if (typeof response.expires_in !== "number" || !Number.isFinite(response.expires_in)) {
        throw new Error("Spotify token response did not contain a valid expires_in value.");
    }

    const expiresAt = Date.now() + response.expires_in * 1000;
    localStorage.setItem("expires_at", String(expiresAt));
    return response.access_token;
}

/*-----------------------------------------------------------------------------------*/

async function fetchProfile(token: string): Promise<any> {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    return await result.json();
}
/*----------------------------------------------------------------------------------------*/

function populateUI(profile: any) {
    document.getElementById("displayName")!.innerText = profile.display_name;
    if (profile.images[0]) {
        const profileImage = new Image(200, 200);
        profileImage.src = profile.images[0].url;
        document.getElementById("avatar")!.appendChild(profileImage);
    }
    document.getElementById("id")!.innerText = profile.id;
    document.getElementById("email")!.innerText = profile.email;
    document.getElementById("uri")!.innerText = profile.uri;
    document.getElementById("uri")!.setAttribute("href", profile.external_urls.spotify);
    document.getElementById("url")!.innerText = profile.href;
    document.getElementById("url")!.setAttribute("href", profile.href);
    document.getElementById("imgUrl")!.innerText = profile.images[0]?.url ?? '(no profile image)';
}

/*------------------------------------------------------------------------------------------*/

function populateArtists(artist: any){
    const ul = document.createElement('ul');

    const linkLi = document.createElement('li');
    linkLi.innerText = "Lien:";
    const link = document.createElement('a');
    link.href = artist.external_urls.spotify;
    link.innerText = artist.name;
    linkLi.appendChild(link);

    const imageUrl = artist.images[0]?.url;
    if (imageUrl) {
        const imageLi = document.createElement('li');
        const image = document.createElement('img');
        image.src = imageUrl;
        imageLi.appendChild(image);
        ul.appendChild(imageLi);
    }

    const nameLi = document.createElement('li');
    nameLi.innerText = "Nom: " + artist.name;

    // const followersLi = document.createElement('li');
    // followersLi.innerText = "Followers: " + artist.followers.total;

    ul.appendChild(nameLi);
    // ul.appendChild(followersLi);
    ul.appendChild(linkLi);
    document.getElementById("artists")!.appendChild(ul);
}

async function fetchArtists(token: string): Promise<any> {
    const result = await fetch("https://api.spotify.com/v1/me/following?type=artist", {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    const response = await result.json();
    if (!result.ok) {
        throw new Error(
            `Spotify followed artists request failed (${result.status}): ${response.error?.message ?? result.statusText}`
        );
    }

    return response;
}

async function populateFollowedArtists(token: string): Promise<void> {
    const artists = await fetchArtists(token);
    for (const artist of artists.artists.items) {
        populateArtists(artist);
    }
}
/*
Quand il sera de nouveau possible de faire des requêtes:
- Compter le nombre d'éléments de fetchArtists
- Faire un parcours de liste dans la réponse json pour afficher un à un les artistes
  en créant des éléments HTML avec document.createElement('mon_element')
- Eventuellement faire une pagination
*/

/*------------------------------------------------------------------------------------------*/

async function fetchSongs(token: string, query: string) {
    // URLSearchParams safely encodes the query and builds Spotify's track-search parameters.
    const params = new URLSearchParams({
        q: query,
        type: "track",
        limit: "10",
        offset: "0"
    });
    const result = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    const response = await result.json();
    if (!result.ok) {
        throw new Error(
            `Spotify followed songs request failed (${result.status}): ${response.error?.message ?? result.statusText}`
        );
    }

    return response;
}

function populateSongs(song: any){
    const ul = document.createElement('ul');

    const nameLi = document.createElement('li');
    const playableBtn = document.createElement('button');

    nameLi.innerText = "Nom:" + song.name
    playableBtn.value = song.uri
    playableBtn.innerText = "Ecouter"
    if(song.is_playable === false){
        playableBtn.disabled = true
    }

    ul.appendChild(nameLi)
    ul.appendChild(playableBtn)

    document.getElementById("songs")!.appendChild(ul);
}

async function populateSearchedSongs(token: string, query: string): Promise<void> {
    const songs = await fetchSongs(token, query);
    const songsSection = document.getElementById("songs")!;
    // Clear the prior search results before displaying the new tracks.
    songsSection.replaceChildren();
    // Spotify returns track results in the tracks.items array.
    for (const song of songs.tracks.items) {
        populateSongs(song);
    }
}

/*
- Récupérer la valeur de search quand on clique sur button
- fetch l'url de l'api avec names=search.value
- Je ne sais pas où mettre le button.onclick qui appelle la fonction fetchSongs
*/

/*-------------------------------------------------------------------------------*/

async function playTrack(token: string, uri: any){
    const result = await fetch("https://api.spotify.com/v1/me/player/play?context_uri="+uri, {
        method: "PUT", headers: { Authorization: `Bearer ${token}` }
    });

    const response = await result.json();
    if (!result.ok) {
        throw new Error(
            `Track could not be played (${result.status}): ${response.error?.message ?? result.statusText}`
        );
    }

    return response;
}

async function pauseTrack(token: string){
    const result = await fetch("https://api.spotify.com/v1/me/player/pause", {
        method: "PUT", headers: { Authorization: `Bearer ${token}` }
    });

    const response = await result.json();
    if (!result.ok) {
        throw new Error(
            `Track could not be paused (${result.status}): ${response.error?.message ?? result.statusText}`
        );
    }

    return response;
}

async function resumeTrack(token: string){
    const result = await fetch("https://api.spotify.com/v1/me/player/play", {
        method: "PUT", headers: { Authorization: `Bearer ${token}` }
    });

    const response = await result.json();
    if (!result.ok) {
        throw new Error(
            `Track could not be resumed (${result.status}): ${response.error?.message ?? result.statusText}`
        );
    }

    return response;
}