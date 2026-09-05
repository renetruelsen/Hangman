using Hangman.Game;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();

var app = builder.Build();

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

// Trækker et nyt ord. "seneste" bruges til at undgå at samme ord kommer to gange i træk.
app.MapGet("/api/word", (string? seneste) =>
{
    var entry = WordBank.Draw(seneste);
    return Results.Ok(new { word = entry.Word, category = entry.Category });
});

app.Run();
