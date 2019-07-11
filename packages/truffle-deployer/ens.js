const ENSJS = require("ethereum-ens");
const contract = require("truffle-contract");
const sha3 = require("web3").utils.sha3;

class ENS {
  constructor({ provider, ensSettings }) {
    this.ensSettings = ensSettings;
    this.provider = provider;
    this.devRegistry = null;
  }

  async deployNewDevENSRegistry(from) {
    const ENSRegistryArtifact = require("@ensdomains/ens").ENSRegistry;
    const ENSRegistry = contract(ENSRegistryArtifact);
    ENSRegistry.setProvider(this.provider);
    const ensRegistry = await ENSRegistry.new({ from });
    this.ensSettings.registryAddress = ensRegistry.address;
    this.devRegistry = ensRegistry;
    return ensRegistry;
  }

  async ensureRegistryExists(from) {
    // See if registry exists on network by resolving an arbitrary address
    // If no registry exists then deploy one
    try {
      await this.ensjs.owner("0x0");
    } catch (error) {
      const noRegistryFound =
        error.message ===
        "This contract object doesn't have address set yet, please set an address first.";
      if (noRegistryFound) {
        await this.deployNewDevENSRegistry(from);
        this.setENSJS();
      } else {
        throw error;
      }
    }
  }

  async ensureResolverExists({ from, name }) {
    // See if the resolver is set, if not then set it
    let resolvedAddress, publicResolver;
    try {
      resolvedAddress = await this.ensjs.resolver(name).addr();
      return { resolvedAddress };
    } catch (error) {
      if (error.message !== "ENS name not found") throw error;
      const PublicResolverArtifact = require("@ensdomains/resolver")
        .PublicResolver;
      const PublicResolver = contract(PublicResolverArtifact);
      PublicResolver.setProvider(this.provider);
      publicResolver = await PublicResolver.new(
        this.ensSettings.registryAddress,
        { from }
      );
      await this.ensjs.setResolver(name, publicResolver.address, { from });
      return { resolvedAddress: null };
    }
  }

  async setAddress({ address, name, from }) {
    this.setENSJS();

    await this.ensureRegistryExists(from);

    if (this.devRegistry) {
      await this.setNameOwner({ from, name });
    }

    // Find the owner of the name and compare it to the "from" field
    const nameOwner = await this.ensjs.owner(name);
    // Future work:
    // Handle case where there is no owner and we try to register it for the user
    // if (nameOwner === "0x0000000000000000000000000000000000000000") {
    //   this.attemptNameRegistration();
    // }

    if (nameOwner !== from) {
      const message =
        `The default address or address provided in the "from" ` +
        `field for registering does not own the specified ENS name. The ` +
        `"from" field address must match the owner of the name.` +
        `\n> Failed to register ENS name ${name}` +
        `\n> Address in "from" field - ${from}` +
        `\n> Current owner of '${name}' - ${nameOwner}`;
      throw new Error(message);
    }

    const { resolvedAddress } = await this.ensureResolverExists({ from, name });

    // If the resolver points to a different address or is not set,
    // then set it to the specified address
    if (resolvedAddress !== address) {
      await this.ensjs.resolver(name).setAddr(address);
    }
  }

  async setNameOwner({ name, from }) {
    await this.devRegistry.setSubnodeOwner("0x0", sha3(name), from, { from });
  }

  setENSJS() {
    this.ensjs = new ENSJS(this.provider, this.ensSettings.registryAddress);
  }
}

module.exports = ENS;
