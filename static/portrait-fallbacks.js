/* Verified same-player NHL archives for official current-season missing images. */
(function (root) {
  const records = {
    8477971: {
      missing: "https://assets.nhle.com/mugs/nhl/20262027/DET/8477971.png",
      image: "https://assets.nhle.com/mugs/nhl/20252026/NSH/8477971.png",
      label: "NHL archive portrait · 2025/26 · Nashville Predators",
    },
    8482806: {
      missing: "https://assets.nhle.com/mugs/nhl/20262027/NSH/8482806.png",
      image: "https://assets.nhle.com/mugs/nhl/20252026/MTL/8482806.png",
      label: "NHL archive portrait · 2025/26 · Montréal Canadiens",
    },
    8476822: {
      missing: "https://assets.nhle.com/mugs/nhl/20262027/NYR/8476822.png",
      image: "https://assets.nhle.com/mugs/nhl/20252026/PHI/8476822.png",
      label: "NHL archive portrait · 2025/26 · Philadelphia Flyers",
    },
    8482111: {
      missing: "https://assets.nhle.com/mugs/nhl/20262027/STL/8482111.png",
      image: "https://assets.nhle.com/mugs/nhl/20252026/NSH/8482111.png",
      label: "NHL archive portrait · 2025/26 · Nashville Predators",
    },
    8480842: {
      missing: "https://assets.nhle.com/mugs/nhl/20262027/EDM/8480842.png",
      image: "https://assets.nhle.com/mugs/nhl/20222023/PIT/8480842.png",
      label: "NHL archive portrait · 2022/23 · Pittsburgh Penguins",
    },
  };
  const resolve = (id, original) => {
    const record = records[id];
    return record?.missing === original ? { ...record } : null;
  };
  const sources = () => Object.values(records).map((record) => record.image);
  root.PortraitFallbacks = { resolve, sources };
})(globalThis);
