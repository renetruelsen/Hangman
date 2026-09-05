using Hangman.Game;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();
builder.Services.AddMemoryCache();

// Wiktionarys API beder om en sigende User-Agent. Kort timeout: kan kilden ikke
// nås hurtigt, er det bedre at falde tilbage til nødplanen end at lade spilleren vente.
builder.Services.AddHttpClient<OnlineWordSource>(client =>
{
    client.BaseAddress = new Uri("https://da.wiktionary.org");
    client.Timeout = TimeSpan.FromSeconds(8);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Galgeleg/1.0 (dansk hangman-POC)");
});

// Singleton: opvarmningen af ordpuljen kører i baggrunden og må ikke dø
// sammen med den request der tilfældigvis startede den.
builder.Services.AddSingleton<WordService>();

var app = builder.Build();

// Hent ordpuljen med det samme, så den er klar inden nogen når at spille.
app.Services.GetRequiredService<WordService>().EnsureWarming();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

/* Ingen UseHttpsRedirection(): POC'en har intet cert-krav, og den simple
   http-launch-profil har ingen https-adresse at omdirigere til — med den
   ville hver eneste request logge en "kunne ikke bestemme https-port"-advarsel. */
app.UseRouting();

app.MapStaticAssets();
app.MapRazorPages()
   .WithStaticAssets();

const string PlayerCookie = "galgeleg-spiller";

// Trækker et nyt ord. Spilleren identificeres af en cookie, så serveren kan
// undgå at udlevere ord som netop denne browser allerede har haft.
app.MapGet("/api/word", (HttpContext ctx, WordService words) =>
{
    if (!ctx.Request.Cookies.TryGetValue(PlayerCookie, out var playerId) || string.IsNullOrWhiteSpace(playerId))
    {
        playerId = Guid.NewGuid().ToString("N");
        ctx.Response.Cookies.Append(PlayerCookie, playerId, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            MaxAge = TimeSpan.FromDays(30)
        });
    }

    var result = words.Draw(playerId);

    return Results.Ok(new
    {
        word = result.Entry.Word,
        category = result.Entry.Category,
        source = result.Origin == WordOrigin.Online ? "online" : "lokal",
        poolSize = result.PoolSize
    });
});

app.Run();
